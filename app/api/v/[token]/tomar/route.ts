import { NextRequest, NextResponse } from 'next/server'
import { getVehicleByToken } from '@/lib/data/vehicles'
import { verifyDriverPin, getDriver } from '@/lib/data/drivers'
import { openUsage } from '@/lib/data/usages'
import { getCompany } from '@/lib/data/companies'
import { adminAuth } from '@/lib/firebase/admin'
import { sendUsageAlertEmail } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const vehicle = await getVehicleByToken(token)
  if (!vehicle) return NextResponse.json({ error: 'not found' }, { status: 404 })

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

  // Aviso best-effort al dueño/admin si el uso anterior quedó sin entrega formal.
  if (forced) {
    try {
      const company = await getCompany(vehicle.companyId)
      const to = company ? (await adminAuth.getUser(company.ownerUid)).email : null
      if (to) {
        await sendUsageAlertEmail(to, {
          patente: vehicle.patente,
          driverNombre: forced.driverNombre,
          tomadoEn: forced.tomadoEn,
        })
      }
    } catch {
      /* best-effort: el uso ya se abrió */
    }
  }

  return NextResponse.json({ ok: true })
}
