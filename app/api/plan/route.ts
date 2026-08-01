import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getCompany, savePlan } from '@/lib/data/companies'
import { createBillingRequest } from '@/lib/data/billing'
import { sendBillingRequestEmail, billingNotifyEmail } from '@/lib/email/resend'
import { MAX_VEHICULOS_SELF_SERVICE, cargoDe } from '@/lib/billing'
import { addDias, DIAS_PRUEBA } from '@/lib/plan/prueba'
import { hoyEnChile } from '@/lib/documents/status'
import type { Periodicidad } from '@/lib/types'

export const dynamic = 'force-dynamic'
// El `after()` del correo corre después de responder pero sigue contando
// contra el límite de ejecución, igual que en tomar/entregar.
export const maxDuration = 30

const PERIODICIDADES: Periodicidad[] = ['mensual', 'anual']

/**
 * El alta del plan: la empresa elige periodicidad y cantidad, y queda con una
 * prueba de 30 días con fecha.
 *
 * Es el punto exacto que reemplaza la pasarela cuando exista: hoy registra una
 * solicitud de facturación y estampa `gratisHasta`; mañana redirige al
 * checkout y `gratisHasta` pasa a ser la fecha del primer cobro.
 */
export async function POST(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // Contratar cambia lo que la empresa paga: solo el Administrador.
  if (!can(m.role, 'billing:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 })
  }
  const { periodicidad, maxVehiculos } = body as Record<string, unknown>

  if (typeof periodicidad !== 'string' || !PERIODICIDADES.includes(periodicidad as Periodicidad)) {
    return NextResponse.json({ error: 'periodicidad inválida' }, { status: 400 })
  }
  const n = Number(maxVehiculos)
  // El tope se comprueba acá y no solo en el formulario: el cliente no decide
  // cuánto cupo se regala durante la prueba.
  if (!Number.isFinite(n) || n < 1 || n > MAX_VEHICULOS_SELF_SERVICE) {
    return NextResponse.json({ error: 'cantidad inválida' }, { status: 400 })
  }
  const vehiculos = Math.floor(n)

  // Este endpoint es el alta, no el cambio de plan. Sin esta comprobación
  // alguien reiniciaría su prueba llamándolo de nuevo.
  const company = await getCompany(m.companyId)
  if (company?.plan?.periodicidad) {
    return NextResponse.json({ error: 'plan_ya_elegido' }, { status: 409 })
  }

  const gratisHasta = addDias(hoyEnChile(new Date()), DIAS_PRUEBA)
  await savePlan(m.companyId, { periodicidad: periodicidad as Periodicidad, maxVehiculos: vehiculos, gratisHasta })

  // Best-effort: que el correo falle no puede dejar a la empresa sin plan. El
  // try/catch va ALREDEDOR de after(), no solo dentro del callback: si after()
  // mismo lanzara, se llevaría puesta la respuesta.
  try {
    const cargo = cargoDe({ vehiculos, periodicidad: periodicidad as Periodicidad })
    const razonSocial = company?.company.razonSocial ?? ''
    const message = `Alta ${periodicidad}: ${cargo.monto} CLP / ${cargo.unidad} · prueba hasta ${gratisHasta}`
    after(async () => {
      try {
        await createBillingRequest({
          uid: m.uid,
          email: m.email,
          companyId: m.companyId,
          razonSocial,
          // El cupo anterior al alta: siempre el default, porque esta ruta solo
          // corre cuando la empresa todavía no había elegido plan.
          currentCupo: company?.plan?.maxVehiculos ?? vehiculos,
          desiredVehicles: vehiculos,
          message,
        })
        const to = billingNotifyEmail()
        if (to) {
          await sendBillingRequestEmail(to, {
            fromEmail: m.email,
            razonSocial,
            currentCupo: company?.plan?.maxVehiculos ?? vehiculos,
            desiredVehicles: vehiculos,
            message,
          })
        }
      } catch (e) {
        console.error('[plan] aviso de alta', e)
      }
    })
  } catch (e) {
    console.error('[plan] after()', e)
  }

  return NextResponse.json({ ok: true })
}
