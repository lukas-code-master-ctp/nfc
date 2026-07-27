import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { getVehicle } from '@/lib/data/vehicles'
import { getCompany } from '@/lib/data/companies'
import { normalizeEmail } from '@/lib/data/invitations'
import {
  createTransferencia,
  getPendienteByVehicle,
  cancelTransferencia,
} from '@/lib/data/transferencias'
import { sendTransferenciaRecibidaEmail, sendTransferenciaEnviadaEmail } from '@/lib/email/resend'
import { appUrl } from '@/lib/email/layout'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Empresa a la que pertenece el correo, o null si no tiene cuenta con empresa. */
async function companyIdDelCorreo(email: string): Promise<string | null> {
  try {
    const u = await adminAuth.getUserByEmail(email)
    const doc = await adminDb.collection('users').doc(u.uid).get()
    return (doc.exists ? doc.data()?.companyId : null) ?? null
  } catch {
    return null // getUserByEmail lanza si el correo no existe
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'vehicle:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const vehicle = await getVehicle(id)
  if (!vehicle || vehicle.companyId !== m.companyId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const email = normalizeEmail(String(body?.email ?? ''))
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'correo_invalido', mensaje: 'Revisa el correo.' }, { status: 400 })
  }

  const destino = await companyIdDelCorreo(email)
  if (!destino) {
    return NextResponse.json(
      { error: 'sin_cuenta', mensaje: 'Ese correo no tiene cuenta en TapCar. Pídele que se registre primero.' },
      { status: 404 },
    )
  }
  if (destino === m.companyId) {
    return NextResponse.json(
      { error: 'misma_empresa', mensaje: 'Ese correo pertenece a tu misma empresa.' },
      { status: 400 },
    )
  }
  if (await getPendienteByVehicle(id)) {
    return NextResponse.json(
      { error: 'ya_pendiente', mensaje: 'Este vehículo ya tiene una transferencia pendiente.' },
      { status: 409 },
    )
  }

  const company = await getCompany(m.companyId)
  const razonSocial = company?.company.razonSocial ?? ''
  const t = await createTransferencia({
    vehicleId: id,
    patente: vehicle.patente,
    deCompanyId: m.companyId,
    deCompanyNombre: razonSocial,
    paraEmail: email,
    creadaPorUid: m.uid,
  })

  // Correos best-effort: si Resend falla, la transferencia igual queda creada.
  const aceptarUrl = `${appUrl()}/transferencias/${t.token}`
  try {
    await sendTransferenciaRecibidaEmail(email, {
      patente: vehicle.patente,
      deCompanyNombre: razonSocial,
      deEmail: m.email,
      aceptarUrl,
    })
  } catch (err) {
    console.error('[transferir] correo al destinatario', err)
  }
  try {
    await sendTransferenciaEnviadaEmail(m.email, {
      patente: vehicle.patente,
      paraEmail: email,
      vehicleId: id,
    })
  } catch (err) {
    console.error('[transferir] correo de respaldo', err)
  }

  return NextResponse.json({ transferencia: t })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'vehicle:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const t = await getPendienteByVehicle(id)
  if (!t || t.deCompanyId !== m.companyId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  await cancelTransferencia(t.id, m.companyId)
  return NextResponse.json({ ok: true })
}
