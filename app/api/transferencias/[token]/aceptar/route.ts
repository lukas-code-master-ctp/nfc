import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { adminAuth } from '@/lib/firebase/admin'
import { getTransferenciaByToken, markAceptada } from '@/lib/data/transferencias'
import { transferirVehiculo } from '@/lib/data/transferirVehiculo'
import { getCompany } from '@/lib/data/companies'
import { listVehicles } from '@/lib/data/vehicles'
import { maxVehiculosDe } from '@/lib/plan'
import { puedeAceptar, type MotivoRechazo } from '@/lib/transferencias/estado'
import { sendTransferenciaAceptadaEmail } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'

const HTTP: Record<MotivoRechazo, number> = {
  no_pendiente: 409,
  expirada: 410,
  otro_destinatario: 403,
  sin_permiso: 403,
  plan_limit: 409,
}

const MENSAJE: Record<MotivoRechazo, string> = {
  no_pendiente: 'Esta transferencia ya fue aceptada o cancelada.',
  expirada: 'Esta transferencia venció. Pídele al dueño que la envíe de nuevo.',
  otro_destinatario: 'Esta transferencia es para otro correo.',
  sin_permiso: 'Necesitas ser Administrador de tu empresa para recibir un vehículo.',
  plan_limit: 'Tu plan no tiene cupo para otro vehículo.',
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const t = await getTransferenciaByToken(token)
  if (!t) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const [company, vehiculos] = await Promise.all([getCompany(m.companyId), listVehicles(m.companyId)])
  const motivo = puedeAceptar({
    transferencia: t,
    emailSesion: m.email,
    role: m.role,
    vehiculosActuales: vehiculos.length,
    maxVehiculos: maxVehiculosDe(company?.plan),
    nowIso: new Date().toISOString(),
  })
  if (motivo) {
    return NextResponse.json({ error: motivo, mensaje: MENSAJE[motivo] }, { status: HTTP[motivo] })
  }

  try {
    await transferirVehiculo(t.vehicleId, t.deCompanyId, m.companyId)
  } catch (err) {
    // Solo `ya_transferido` es esperado; el resto es un 500 de verdad.
    if (err instanceof Error && err.message === 'ya_transferido') {
      return NextResponse.json(
        { error: 'ya_transferido', mensaje: 'Ese vehículo ya no está disponible.' },
        { status: 409 },
      )
    }
    console.error('[aceptar-transferencia]', token, err)
    return NextResponse.json({ error: 'error' }, { status: 500 })
  }

  // Recién acá: si el movimiento falló, la transferencia sigue pendiente y se puede reintentar.
  await markAceptada(t.id, m.uid)

  try {
    const emisor = await adminAuth.getUser(t.creadaPorUid)
    if (emisor.email) {
      await sendTransferenciaAceptadaEmail(emisor.email, { patente: t.patente, paraEmail: t.paraEmail })
    }
  } catch (err) {
    console.error('[aceptar-transferencia] aviso al emisor', err)
  }

  return NextResponse.json({ ok: true, vehicleId: t.vehicleId })
}
