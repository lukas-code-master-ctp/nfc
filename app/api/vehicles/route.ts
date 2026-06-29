import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { listVehicles, createVehicle } from '@/lib/data/vehicles'
import { getProfile } from '@/lib/data/profile'
import { maxVehiculos } from '@/lib/plan'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await listVehicles(user.uid))
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  const { patente, marca, modelo, anio, color } = body
  if (!patente || !marca || !modelo) {
    return NextResponse.json({ error: 'faltan campos' }, { status: 400 })
  }

  // Cupo del plan: bloquea crear más vehículos de los permitidos (el límite
  // vive en el perfil; lo configura el admin de la plataforma).
  const [vehicles, profile] = await Promise.all([
    listVehicles(user.uid),
    getProfile(user.uid, user.email),
  ])
  const limit = maxVehiculos(profile)
  if (vehicles.length >= limit) {
    return NextResponse.json({ error: 'plan_limit', limit }, { status: 409 })
  }

  const vehicle = await createVehicle(user.uid, { patente, marca, modelo, anio: Number(anio) || 0, color: color ?? '' })
  return NextResponse.json(vehicle, { status: 201 })
}
