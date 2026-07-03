import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { updateDriver, resetDriverPin, deleteDriver } from '@/lib/data/drivers'
import { isValidPinFormat } from '@/lib/drivers/pin'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'driver:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  try {
    if (typeof body?.pin === 'string' && body.pin.length > 0) {
      if (!isValidPinFormat(body.pin)) return NextResponse.json({ error: 'El PIN debe ser de 4 dígitos.' }, { status: 400 })
      await resetDriverPin(m.companyId, id, body.pin)
    }
    const patch: { nombre?: string; rut?: string; activo?: boolean } = {}
    if (typeof body?.nombre === 'string') patch.nombre = body.nombre
    if (typeof body?.rut === 'string') patch.rut = body.rut
    if (typeof body?.activo === 'boolean') patch.activo = body.activo
    if (Object.keys(patch).length > 0) await updateDriver(m.companyId, id, patch)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'driver:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  try {
    await deleteDriver(m.companyId, id)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
