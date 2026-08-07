import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getCompany, savePlan } from '@/lib/data/companies'
import { listVehicles } from '@/lib/data/vehicles'
import { createBillingRequest } from '@/lib/data/billing'
import { sendBillingRequestEmail, billingNotifyEmail } from '@/lib/email/resend'
import { MAX_VEHICULOS_SELF_SERVICE, cargoDe } from '@/lib/billing'
import { addDias, gratisHastaDeAlta } from '@/lib/plan/prueba'
import { hoyEnChile } from '@/lib/documents/status'
import { suscripcionInicial, type Periodicidad } from '@/lib/types'

export const dynamic = 'force-dynamic'
// El `after()` del correo corre después de responder pero sigue contando
// contra el límite de ejecución, igual que en tomar/entregar.
export const maxDuration = 30

const PERIODICIDADES: Periodicidad[] = ['mensual', 'anual']

/**
 * El alta del plan: la empresa elige periodicidad y cantidad, y queda sin
 * cobro hasta `LANZAMIENTO_HASTA` (o desde hoy si esa ventana ya pasó).
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
  const { periodicidad, maxVehiculos, solicitados } = body as Record<string, unknown>

  if (typeof periodicidad !== 'string' || !PERIODICIDADES.includes(periodicidad as Periodicidad)) {
    return NextResponse.json({ error: 'periodicidad inválida' }, { status: 400 })
  }

  // `solicitados` es opcional: lo manda la pantalla cuando el usuario pidió
  // más que el tope self-service (más de 30). Si es un número finito y
  // razonable por encima del tope, la cuenta igual queda operativa con el
  // tope mientras se coordina el resto — ver I2. Cualquier otro valor se
  // ignora en vez de fallar la petición por él.
  let solicitadosNum: number | null = null
  if (solicitados !== undefined) {
    const s = Number(solicitados)
    if (Number.isFinite(s) && s > 0 && s <= 1_000_000) solicitadosNum = Math.floor(s)
  }
  const excedeTope = solicitadosNum != null && solicitadosNum > MAX_VEHICULOS_SELF_SERVICE

  // Se necesita antes de calcular `vehiculos`: una cuenta anterior al selector
  // puede llegar con un cupo (`maxVehiculos`) por ENCIMA del tope self-service,
  // otorgado a mano por un admin de plataforma. Forzar el tope ahí sería una
  // baja de cupo silenciosa e irreversible (el 409 de más abajo cierra la
  // puerta a reintentar) — ver el caso de Inmobiliaria Isla SpA (50 → 30).
  const company = await getCompany(m.companyId)

  let vehiculos: number
  if (excedeTope) {
    vehiculos = Math.max(MAX_VEHICULOS_SELF_SERVICE, company?.plan?.maxVehiculos ?? 0)
  } else {
    const n = Number(maxVehiculos)
    // El tope se comprueba acá y no solo en el formulario: el cliente no decide
    // cuánto cupo se regala durante la prueba.
    if (!Number.isFinite(n) || n < 1 || n > MAX_VEHICULOS_SELF_SERVICE) {
      return NextResponse.json({ error: 'cantidad inválida' }, { status: 400 })
    }
    vehiculos = Math.floor(n)
  }

  // Este endpoint es el alta, no el cambio de plan. Sin esta comprobación
  // alguien reiniciaría su prueba llamándolo de nuevo.
  if (company?.plan?.periodicidad) {
    return NextResponse.json({ error: 'plan_ya_elegido' }, { status: 409 })
  }

  // Red que evita dejar a la empresa por encima de su propio cupo: una cuenta
  // anterior al selector (periodicidad ausente) puede entrar a /plan con más
  // vehículos ya cargados que los que está por elegir acá. Sin esto, un envío
  // que no cambie el número sembrado por el cliente reduciría el cupo bajo el
  // uso real y dejaría a la empresa sin forma de arreglarlo ella sola (ver C1).
  const vehiculosActuales = await listVehicles(m.companyId)
  if (vehiculos < vehiculosActuales.length) {
    return NextResponse.json(
      { error: 'cupo_menor_al_uso', vehiculos: vehiculosActuales.length },
      { status: 409 },
    )
  }

  const hoy = hoyEnChile(new Date())
  const gratisHastaCalculado = gratisHastaDeAlta(hoy)
  // El alta nunca ACORTA una fecha que la empresa ya tenía: una promoción
  // canjeada antes de elegir plan (o el backfill de la migración) puede
  // haberle dejado un `gratisHasta` posterior al de la ventana de
  // lanzamiento — igual que `calcularParche` en la migración, escribir
  // encima le quitaría días ya prometidos. `null` (sin fecha previa, o la
  // ventana ya pasada) siempre pierde contra cualquier fecha real: las dos
  // son cadenas `YYYY-MM-DD`, así que el orden lexicográfico es el
  // cronológico.
  const gratisHastaPrevio = company?.plan?.gratisHasta ?? null
  const gratisHasta =
    gratisHastaPrevio && (!gratisHastaCalculado || gratisHastaPrevio > gratisHastaCalculado)
      ? gratisHastaPrevio
      : gratisHastaCalculado
  await savePlan(m.companyId, {
    periodicidad: periodicidad as Periodicidad,
    maxVehiculos: vehiculos,
    gratisHasta,
    // El primer cobro cae al día siguiente del último día gratis, o hoy mismo
    // si la ventana de lanzamiento ya pasó.
    suscripcion: suscripcionInicial(gratisHasta ? addDias(gratisHasta, 1) : hoy),
  })

  // Best-effort: que el correo falle no puede dejar a la empresa sin plan. El
  // try/catch va ALREDEDOR de after(), no solo dentro del callback: si after()
  // mismo lanzara, se llevaría puesta la respuesta.
  try {
    const cargo = cargoDe({ vehiculos, periodicidad: periodicidad as Periodicidad })
    const razonSocial = company?.company.razonSocial ?? ''
    const message = excedeTope
      ? `Alta ${periodicidad}: ${cargo.monto} CLP / ${cargo.unidad} · sin cobro hasta ${gratisHasta ?? 'no aplica'} · solicitó ${solicitadosNum} vehículos, se dejó en ${MAX_VEHICULOS_SELF_SERVICE} mientras se coordina el resto.`
      : `Alta ${periodicidad}: ${cargo.monto} CLP / ${cargo.unidad} · sin cobro hasta ${gratisHasta ?? 'no aplica'}`
    after(async () => {
      try {
        await createBillingRequest({
          uid: m.uid,
          email: m.email,
          companyId: m.companyId,
          razonSocial,
          // El cupo anterior al alta: en una cuenta nueva es el default de
          // `getCompany` (nunca eligió plan todavía); en una cuenta anterior al
          // selector (periodicidad ausente) es el cupo real que ya tenía un
          // admin de plataforma o el uso acumulado — `company?.plan?.maxVehiculos`
          // ya trae ese valor real, no el default, porque `getCompany` solo
          // rellena con `DEFAULT_PLAN` lo que falta.
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
