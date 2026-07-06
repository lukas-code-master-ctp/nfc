import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { createDriver, listDrivers } from '@/lib/data/drivers'
import { isValidPinFormat } from '@/lib/drivers/pin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'driver:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const drivers = await listDrivers(m.companyId)
  return NextResponse.json({
    drivers: drivers.map((d) => ({ id: d.id, nombre: d.nombre, rut: d.rut ?? null, activo: d.activo, createdAt: d.createdAt, pin: d.pin ?? null })),
  })
}

export async function POST(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'driver:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const nombre = String(body?.nombre ?? '').trim()
  const rut = body?.rut ? String(body.rut).trim() : undefined
  const pin = String(body?.pin ?? '')
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 })
  if (!isValidPinFormat(pin)) return NextResponse.json({ error: 'El PIN debe ser de 4 dígitos.' }, { status: 400 })
  const { id } = await createDriver(m.companyId, m.uid, { nombre, rut, pin })
  return NextResponse.json({ id })
}
