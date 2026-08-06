// En qué fase de cobro está una empresa (puro, sin Firebase).
//
// Son dos fechas y no una: durante la prueba no se cobra nada, así que si la
// cobertura de un código aplicara también a los días de prueba que quedaban,
// canjear dejaría al usuario PEOR que no canjear. Por eso la promoción empieza
// donde termina la prueba y lleva su propia fecha.

import type { PlanData } from '@/lib/types'

export type FasePlan = 'prueba' | 'promo' | 'plena'

/**
 * Ambas fechas son `YYYY-MM-DD`, así que la comparación de strings es la
 * comparación cronológica. Los dos bordes son inclusivos: el último día de
 * cada fase todavía pertenece a esa fase.
 */
export function faseDelPlan(
  { gratisHasta, promoHasta }: { gratisHasta?: string | null; promoHasta?: string | null },
  hoy: string,
): FasePlan {
  if (gratisHasta && hoy <= gratisHasta) return 'prueba'
  if (promoHasta && hoy <= promoHasta) return 'promo'
  return 'plena'
}

/**
 * Cuántos vehículos cubre la promoción HOY, para restar del cargo.
 *
 * Sin esta función es tentador "simplificar" a `promo?.vehiculosIncluidos ??
 * 0` en el punto de cobro, y eso paga la cuenta de una empresa con promoción
 * VENCIDA como si todavía estuviera vigente — para siempre, porque
 * `PromoAplicada` es una copia congelada que no se borra sola. La cobertura
 * solo existe en la fase `promo`: 0 en `prueba` (ahí no se cobra nada, así que
 * "cobertura" no aplica) y 0 en `plena` (la promoción ya terminó).
 */
export function coberturaDe(plan: Pick<PlanData, 'gratisHasta' | 'promo'> | undefined, hoy: string): number {
  const promo = plan?.promo ?? null
  const fase = faseDelPlan({ gratisHasta: plan?.gratisHasta, promoHasta: promo?.hasta }, hoy)
  return fase === 'promo' ? (promo?.vehiculosIncluidos ?? 0) : 0
}
