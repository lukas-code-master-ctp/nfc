import { NextRequest, NextResponse, after } from 'next/server'
import { getVehicleByToken } from '@/lib/data/vehicles'
import { verifyDriverPin, getDriver, incrementDriverStats } from '@/lib/data/drivers'
import { closeUsage, getUsage } from '@/lib/data/usages'
import { buildDano } from '@/lib/usages/dano'
import { analyzeUsage } from '@/lib/ai/analyzeUsage'
import { createAlerta } from '@/lib/data/alertas'
import { getCompany } from '@/lib/data/companies'
import { alertRecipientEmails } from '@/lib/data/members'
import { sendDanoEmail } from '@/lib/email/resend'

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

  // `buildDano` nunca emite claves con `undefined` (Firestore las rechaza).
  const dano = buildDano(body?.dano)

  let usageId: string
  let cierre: Awaited<ReturnType<typeof closeUsage>>
  try {
    cierre = await closeUsage(vehicle.companyId, vehicle.id, { id: driver.id, nombre: driver.nombre }, { tablero, cabina }, dano)
    usageId = cierre.id
  } catch (e) {
    // `closeUsage` lanza 'no_open' solo cuando no hay uso abierto (409). Cualquier
    // otro error es un fallo real: 500 + log, no lo enmascaramos como 409.
    if (e instanceof Error && e.message === 'no_open') {
      return NextResponse.json({ error: 'Este vehículo no tiene un uso abierto.' }, { status: 409 })
    }
    console.error('[entregar]', e)
    return NextResponse.json({ error: 'No se pudo registrar la entrega. Inténtalo de nuevo.' }, { status: 500 })
  }

  // Daño reportado: alerta in-app (pill del dashboard), contador y email de aviso.
  if (dano?.hay) {
    const u = await getUsage(usageId).catch(() => null)
    const driverNombre = u?.driverNombre ?? driver.nombre
    try {
      await createAlerta({
        companyId: vehicle.companyId,
        vehicleId: vehicle.id,
        patente: vehicle.patente,
        usageId,
        tipo: 'dano',
        driverNombre,
        nota: dano.nota,
      })
    } catch {
      /* best-effort */
    }
    if (u?.driverId) {
      try { await incrementDriverStats(u.driverId, 'danos') } catch { /* best-effort */ }
    }
    try {
      const company = await getCompany(vehicle.companyId)
      const emails = company ? await alertRecipientEmails(vehicle.companyId, company.ownerUid) : []
      for (const to of emails) {
        await sendDanoEmail(to, {
          patente: vehicle.patente,
          vehicleId: vehicle.id,
          usageId,
          driverNombre,
          nota: dano.nota,
        })
      }
    } catch {
      /* best-effort */
    }
  }

  // Entrega irregular (la cerró otro conductor): solo cuenta para el reporte de
  // responsabilidad del conductor original. Ya no genera alerta ni email.
  if (cierre.entregaIrregular) {
    try { await incrementDriverStats(cierre.driverOriginal.id, 'sinEntrega') } catch { /* best-effort */ }
  }

  // Análisis IA en segundo plano (post-respuesta, best-effort).
  after(() => analyzeUsage(usageId))
  return NextResponse.json({ ok: true })
}
