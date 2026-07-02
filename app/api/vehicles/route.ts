import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { listVehicles, createVehicle } from '@/lib/data/vehicles'
import { getCompany } from '@/lib/data/companies'
import { maxVehiculosDe } from '@/lib/plan'

export async function GET() {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await listVehicles(m.companyId))
}

export async function POST(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'vehicle:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = await req.json()
  const { patente, marca, modelo, anio, color } = body
  if (!patente || !marca || !modelo) {
    return NextResponse.json({ error: 'faltan campos' }, { status: 400 })
  }

  // Cupo del plan: bloquea crear más vehículos de los permitidos (el límite
  // vive en el plan de la empresa; lo configura el admin de la plataforma).
  const [vehicles, company] = await Promise.all([
    listVehicles(m.companyId),
    getCompany(m.companyId),
  ])
  const limit = maxVehiculosDe(company?.plan)
  if (vehicles.length >= limit) {
    return NextResponse.json({ error: 'plan_limit', limit }, { status: 409 })
  }

  const vehicle = await createVehicle(m.companyId, m.uid, {
    patente,
    marca,
    modelo,
    anio: Number(anio) || 0,
    color: color ?? '',
  })
  return NextResponse.json(vehicle, { status: 201 })
}
