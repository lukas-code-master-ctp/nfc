import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { isAdminEmail } from '@/lib/auth/admin'
import { saveCompany } from '@/lib/data/companies'
import { deleteCompanyCascade } from '@/lib/data/deleteCompany'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdminEmail(me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const max = Number(body?.maxVehiculos)
  if (!Number.isFinite(max) || max < 1) {
    return NextResponse.json({ error: 'maxVehiculos inválido (mínimo 1)' }, { status: 400 })
  }

  await saveCompany(id, { plan: { maxVehiculos: Math.floor(max) } })
  return NextResponse.json({ ok: true, companyId: id, maxVehiculos: Math.floor(max) })
}

// Elimina la empresa COMPLETA (vehículos, documentos, archivos, conductores,
// usos, alertas, invitaciones, miembros + usuarios de Auth). Irreversible.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdminEmail(me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  await deleteCompanyCascade(id)
  return NextResponse.json({ ok: true })
}
