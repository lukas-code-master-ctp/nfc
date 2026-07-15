// Kilometraje del vehículo derivado de sus usos (lógica pura, sin Firebase).
// El odómetro solo sube, así que el km del vehículo = el máximo leído entre los
// usos; la fecha es la del uso que aportó ese máximo.

type UsoKm = {
  km?: number | null
  entregadoEn?: string | null
  createdAt?: string | null
}

/**
 * Devuelve el km máximo entre los usos (ignora `km` null/inválido) con la fecha
 * del uso que lo aportó (`entregadoEn` o, si falta, `createdAt`). `null` si
 * ningún uso tiene lectura de km.
 */
export function kmDeUsos(usos: UsoKm[]): { km: number; fecha: string } | null {
  let mejor: { km: number; fecha: string } | null = null
  for (const u of usos) {
    if (typeof u.km !== 'number' || !Number.isFinite(u.km) || u.km < 0) continue
    if (!mejor || u.km > mejor.km) {
      mejor = { km: u.km, fecha: u.entregadoEn ?? u.createdAt ?? '' }
    }
  }
  return mejor
}
