// Búsqueda de vehículos en el dashboard (lógica pura, sin Firebase ni React).
// Filtra por patente, marca o modelo, tolerante a mayúsculas, acentos y espacios.

/** Normaliza texto para búsqueda: minúsculas, sin acentos, espacios colapsados. */
export function normalizarBusqueda(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita diacríticos
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * ¿El vehículo coincide con la búsqueda? `queryNorm` debe venir ya normalizado
 * (con `normalizarBusqueda`). Query vacía = coincide con todos.
 */
export function coincideBusqueda(
  v: { patente: string; marca: string; modelo: string },
  queryNorm: string,
): boolean {
  if (!queryNorm) return true
  const texto = normalizarBusqueda(`${v.patente} ${v.marca} ${v.modelo}`)
  return texto.includes(queryNorm)
}
