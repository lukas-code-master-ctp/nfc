import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { listVehicles, createVehicle } from '@/lib/data/vehicles'
import { getCompany } from '@/lib/data/companies'
import { maxVehiculosDe } from '@/lib/plan'
import { normalizarMarca } from '@/lib/vehicles/marcas'

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
  if (typeof marca !== 'string') {
    return NextResponse.json({ error: 'faltan campos' }, { status: 400 })
  }
  // Normalizar ANTES de validar: una marca de puros espacios ("   ") pasa un
  // guard de "no vacío" porque técnicamente no es una cadena vacía, pero
  // normalizarMarca la deja en '' — y como `marca` no se puede editar después
  // de crear el vehículo (no está en la whitelist del PATCH), guardarla en
  // blanco sería un error permanente para ese vehículo.
  const marcaNormalizada = normalizarMarca(marca)
  if (!patente || !marcaNormalizada || !modelo) {
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
    // Ya normalizada arriba (antes de validar). En el servidor y no en el
    // cliente: el combobox solo sugiere, y así queda cubierto también quien
    // cree un vehículo por otra vía.
    marca: marcaNormalizada,
    modelo,
    anio: Number(anio) || 0,
    color: color ?? '',
  })
  return NextResponse.json(vehicle, { status: 201 })
}
