// Lógica pura (sin Firebase) del parche que `scripts/migrar-suscripciones.mjs`
// aplica a cada empresa. Separada del I/O de Firestore para poder testearla
// sin tocar producción — ver `scripts/lib/__tests__/parcheSuscripcion.test.ts`.
//
// OJO: `LANZAMIENTO_HASTA` y `addDias` son una COPIA de `lib/plan/prueba.ts`
// (los `.mjs` no pueden importar TypeScript). El test de arriba SÍ puede
// importar este archivo (es JavaScript puro), así que `calcularParche` en sí
// NO está duplicada: el test importa la función real. Lo único que queda
// duplicado es la fecha y el helper de fechas, y el test falla si se
// desvían de `lib/plan/prueba.ts`.

/** Último día sin cobro de la promoción de lanzamiento, INCLUSIVE. Copia de `lib/plan/prueba.ts`. */
export const LANZAMIENTO_HASTA = '2026-09-01'

/** `YYYY-MM-DD` + días, sobre fecha calendario. Copia de `lib/plan/prueba.ts`. */
export function addDias(fechaISO, dias) {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + dias))
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(t.getUTCDate()).padStart(2, '0')
  return `${t.getUTCFullYear()}-${mm}-${dd}`
}

/** Un bloque de suscripción nuevo, en su estado inicial. Copia de `suscripcionInicial` en `lib/types.ts`. */
function suscripcionInicial(proximoCobro) {
  return {
    flowCustomerId: null,
    tarjeta: null,
    cicloDesde: null,
    proximoCobro,
    impagoDesde: null,
    cupoProximoCiclo: null,
    cancelaEn: null,
  }
}

/**
 * Calcula el parche (notación de punto, para `update`) que deja a `plan` en
 * el estado post-lanzamiento. Devuelve `{}` si la empresa ya está al día —
 * eso es lo que hace idempotente al script: correrlo dos veces no cambia
 * nada la segunda vez.
 *
 * `plan` es el mapa `plan` tal cual viene de Firestore (puede venir ausente,
 * `{}`, o con cualquier subconjunto de sus campos). La presencia de la clave
 * `periodicidad` importa tanto como su valor, así que este objeto NO puede
 * ser el resultado de mezclarlo con un default.
 */
export function calcularParche(plan) {
  const p = plan ?? {}
  const patch = {}

  // 1. Nivelar la promoción de lanzamiento. Es una promoción de lanzamiento:
  //    no tiene sentido que quien llegó primero reciba menos días que quien
  //    llegó después. Una empresa con fecha POSTERIOR a la de lanzamiento ya
  //    tiene algo mejor prometido (ej. una promoción canjeada) y se deja
  //    intacta — nivelar hacia abajo le quitaría días.
  const actual = p.gratisHasta ?? null
  const gratisHasta = !actual || actual < LANZAMIENTO_HASTA ? LANZAMIENTO_HASTA : actual
  if (gratisHasta !== actual) patch['plan.gratisHasta'] = gratisHasta

  // 2. Cerrar el hueco de `periodicidad` ausente: pasa a `null` explícito,
  //    que es lo que `debeElegirPlan` interpreta como "cuenta que debe
  //    elegir plan". Ya presente (sea `null` o un valor real) se deja igual.
  if (!('periodicidad' in p)) patch['plan.periodicidad'] = null

  // 3. Sembrar `plan.suscripcion` si falta, con `proximoCobro` al día
  //    siguiente del último día gratis YA nivelado (paso 1) — no del
  //    original, para que una empresa que recién sube a LANZAMIENTO_HASTA
  //    no quede con el próximo cobro en el día equivocado.
  if (!p.suscripcion) patch['plan.suscripcion'] = suscripcionInicial(addDias(gratisHasta, 1))

  return patch
}
