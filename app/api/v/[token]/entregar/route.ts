import { NextRequest, NextResponse, after } from 'next/server'
import { getVehicleByToken } from '@/lib/data/vehicles'
import { verifyDriverPin, getDriver } from '@/lib/data/drivers'
import { closeUsage, getUsage } from '@/lib/data/usages'
import { analyzeUsage } from '@/lib/ai/analyzeUsage'
import { createAlerta } from '@/lib/data/alertas'

export const dynamic = 'force-dynamic'
// El análisis IA corre post-respuesta vía after(); dale margen a la función.
export const maxDuration = 30

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const vehicle = await getVehicleByToken(token)
  if (!vehicle) return NextResponse.json({ error: 'Vehículo no encontrado.' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const driverId = String(body?.driverId ?? '')
  const pin = String(body?.pin ?? '')
  const tablero = body?.fotos?.tablero
  const cabina = body?.fotos?.cabina
  if (typeof tablero !== 'string' || typeof cabina !== 'string' || !tablero || !cabina) {
    return NextResponse.json({ error: 'Faltan las fotos del tablero y la cabina.' }, { status: 400 })
  }

  const estado = await verifyDriverPin(vehicle.companyId, driverId, pin)
  if (estado === 'locked') return NextResponse.json({ error: 'Demasiados intentos.' }, { status: 429 })
  if (estado !== 'ok') return NextResponse.json({ error: 'PIN incorrecto.' }, { status: 401 })

  const driver = await getDriver(driverId)
  if (!driver) return NextResponse.json({ error: 'Conductor no encontrado.' }, { status: 404 })

  const dano = body?.dano?.hay
    ? { hay: true, nota: typeof body.dano.nota === 'string' ? body.dano.nota.slice(0, 500) : undefined, fotoPath: typeof body.dano.fotoPath === 'string' ? body.dano.fotoPath : undefined }
    : undefined

  let usageId: string
  try {
    usageId = await closeUsage(vehicle.companyId, vehicle.id, { id: driver.id, nombre: driver.nombre }, { tablero, cabina }, dano)
  } catch {
    return NextResponse.json({ error: 'Este vehículo no tiene un uso abierto.' }, { status: 409 })
  }

  // Alerta best-effort si se reportó daño; se atribuye al conductor que tenía el vehículo.
  if (dano?.hay) {
    try {
      const u = await getUsage(usageId)
      await createAlerta({
        companyId: vehicle.companyId,
        vehicleId: vehicle.id,
        patente: vehicle.patente,
        usageId,
        tipo: 'dano',
        driverNombre: u?.driverNombre ?? driver.nombre,
        nota: dano.nota,
      })
    } catch {
      /* best-effort */
    }
  }

  // Análisis IA en segundo plano (post-respuesta, best-effort).
  after(() => analyzeUsage(usageId))
  return NextResponse.json({ ok: true })
}
