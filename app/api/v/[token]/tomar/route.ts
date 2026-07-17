import { NextRequest, NextResponse, after } from 'next/server'
import { getVehicleByToken, setDanoActivo } from '@/lib/data/vehicles'
import { verifyDriverPin, getDriver, incrementDriverStats } from '@/lib/data/drivers'
import { openUsage } from '@/lib/data/usages'
import { buildDanoActivo } from '@/lib/usages/danoActivo'
import { getCompany } from '@/lib/data/companies'
import { alertRecipientEmails } from '@/lib/data/members'
import { sendIncidenciaEmail } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'
// El email de incidencia corre post-respuesta vía after(); dale margen a la función.
export const maxDuration = 30

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

  // Incidencia previa: el conductor reporta un daño preexistente al tomar el
  // vehículo (antes de usarlo). Se guarda como danoActivo del vehículo y avisa
  // por email a los destinatarios de alertas de la empresa (best-effort).
  const reporte = body?.dano
  if (reporte && (reporte.nota || reporte.fotoPath)) {
    const dano = buildDanoActivo(
      { nota: typeof reporte.nota === 'string' ? reporte.nota : null, fotoPath: typeof reporte.fotoPath === 'string' && reporte.fotoPath ? reporte.fotoPath : null },
      'conductor', driver.nombre, new Date().toISOString(),
    )
    try { await setDanoActivo(vehicle.id, vehicle.companyId, dano) } catch { /* best-effort */ }
    const nota = dano.nota
    after(async () => {
      try {
        const company = await getCompany(vehicle.companyId)
        const emails = company ? await alertRecipientEmails(vehicle.companyId, company.ownerUid) : []
        for (const to of emails) {
          await sendIncidenciaEmail(to, { patente: vehicle.patente, vehicleId: vehicle.id, driverNombre: driver.nombre, nota })
        }
      } catch { /* best-effort */ }
    })
  }

  return NextResponse.json({ ok: true })
}
