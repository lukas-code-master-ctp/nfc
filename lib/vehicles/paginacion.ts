// Paginación del dashboard (lógica pura, sin React): arma la secuencia de
// páginas a mostrar en el paginador numerado, colapsando con '…' cuando hay
// muchas páginas.

export const HUECO = '…' as const

/**
 * Secuencia de páginas a dibujar. Siempre incluye la primera, la última y una
 * `ventana` de páginas alrededor de la actual; los saltos se marcan con '…'.
 * Ej: rangoPaginas(6, 20) → [1, '…', 5, 6, 7, '…', 20].
 */
export function rangoPaginas(actual: number, total: number, ventana = 1): (number | typeof HUECO)[] {
  if (total <= 1) return [1]
  const paginas = new Set<number>([1, total, actual])
  for (let i = 1; i <= ventana; i++) {
    if (actual - i >= 1) paginas.add(actual - i)
    if (actual + i <= total) paginas.add(actual + i)
  }
  const ordenadas = [...paginas].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out: (number | typeof HUECO)[] = []
  let prev = 0
  for (const p of ordenadas) {
    if (prev && p - prev > 1) out.push(HUECO)
    out.push(p)
    prev = p
  }
  return out
}
