import { NextRequest, NextResponse } from 'next/server'
import { getVehicleByToken } from '@/lib/data/vehicles'
import { verifyDriverPin, getDriver, incrementDriverStats } from '@/lib/data/drivers'
import { openUsage } from '@/lib/data/usages'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const vehicle = await getVehicleByToken(token)
  if (!vehicle) return NextResponse.json({ error: 'Vehículo no encontrado.' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const driverId = String(body?.driverId ?? '')
  const pin = String(body?.pin ?? '')
  if (!driverId || !pin) return NextResponse.json({ error: 'Faltan datos.' }, { status: 400 })

  const estado = await verifyDriverPin(vehicle.companyId, driverId, pin)
  if (estado === 'locked') return NextResponse.json({ error: 'Demasiados intentos. Espera unos minutos.' }, { status: 429 })
  if (estado !== 'ok') return NextResponse.json({ error: 'PIN incorrecto.' }, { status: 401 })

  const driver = await getDriver(driverId)
  if (!driver) return NextResponse.json({ error: 'Conductor no encontrado.' }, { status: 404 })

  const { forced } = await openUsage(vehicle.companyId, vehicle.id, { id: driver.id, nombre: driver.nombre })
  try { await incrementDriverStats(driver.id, 'usos') } catch { /* best-effort */ }

  // El conductor anterior no cerró su uso (fuerza-cierre). Solo cuenta para el
  // reporte de responsabilidad; ya no genera alerta ni email.
  if (forced) {
    try { await incrementDriverStats(forced.driverId, 'sinEntrega') } catch { /* best-effort */ }
  }

  return NextResponse.json({ ok: true })
}
