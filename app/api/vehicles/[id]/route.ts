import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getVehicle, updateVehicle, deleteVehicle } from '@/lib/data/vehicles'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const v = await getVehicle(id)
  if (!v || v.companyId !== m.companyId) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(v)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'vehicle:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const patch = await req.json()
  try {
    await updateVehicle(id, m.companyId, patch)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'vehicle:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    await deleteVehicle(id, m.companyId)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
