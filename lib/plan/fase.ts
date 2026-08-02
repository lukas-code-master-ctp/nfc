// En qué fase de cobro está una empresa (puro, sin Firebase).
//
// Son dos fechas y no una: durante la prueba no se cobra nada, así que si la
// cobertura de un código aplicara también a los días de prueba que quedaban,
// canjear dejaría al usuario PEOR que no canjear. Por eso la promoción empieza
// donde termina la prueba y lleva su propia fecha.

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
