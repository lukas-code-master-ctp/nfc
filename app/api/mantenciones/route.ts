import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getVehicle } from '@/lib/data/vehicles'
import { createMantencion, listMantenciones } from '@/lib/data/mantenciones'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const vehicleId = req.nextUrl.searchParams.get('vehicleId') ?? ''
  const v = await getVehicle(vehicleId)
  if (!v || v.companyId !== m.companyId) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ mantenciones: await listMantenciones(vehicleId) })
}

export async function POST(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'document:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const vehicleId = String(body?.vehicleId ?? '')
  const fecha = String(body?.fecha ?? '')
  if (!vehicleId || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Faltan datos (vehículo y fecha).' }, { status: 400 })
  }
  const v = await getVehicle(vehicleId)
  if (!v || v.companyId !== m.companyId) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const km = typeof body?.km === 'number' && Number.isFinite(body.km) && body.km >= 0 ? Math.floor(body.km) : null
  const nota = typeof body?.nota === 'string' && body.nota.trim() ? body.nota.trim().slice(0, 500) : null
  const filePath = typeof body?.filePath === 'string' && body.filePath ? body.filePath : null
  const mant = await createMantencion(m.companyId, m.uid, { vehicleId, fecha, km, nota, filePath, fileUrl: filePath })
  return NextResponse.json({ ok: true, id: mant.id })
}
