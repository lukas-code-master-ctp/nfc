import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { listVehicles, createVehicle } from '@/lib/data/vehicles'

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
  const vehicle = await createVehicle(user.uid, { patente, marca, modelo, anio: Number(anio) || 0, color: color ?? '' })
  return NextResponse.json(vehicle, { status: 201 })
}
