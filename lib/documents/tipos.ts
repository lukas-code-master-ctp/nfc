// Qué tipos de documento se ofrecen en el selector (puro, sin Firebase).
import { DOCUMENT_TYPES_ELEGIBLES, type DocumentType } from '@/lib/types'

/**
 * Un vehículo tiene un solo Permiso de Circulación, una sola Revisión Técnica,
 * etc., así que el tipo que ya está cargado se saca de la lista. `otro` es la
 * excepción: es el cajón para todo lo demás y puede repetirse.
 *
 * Ojo con la consecuencia, que es real: al ocultar el tipo ya usado tampoco se
 * puede guardar el documento del año pasado junto al nuevo. Para conservarlo hay
 * que borrar el anterior, o cargarlo como "Otro".
 */
export function tiposDisponibles({
  usados,
  incluir = null,
}: {
  usados: DocumentType[]
  /**
   * Tipo que se ofrece igual aunque esté usado o descontinuado: el del documento
   * que se está editando. Sin esto, abrir la edición de un documento cuyo tipo
   * ya no está en la lista lo dejaría con el `<select>` en blanco, y guardar le
   * cambiaría el tipo sin que nadie lo pidiera.
   */
  incluir?: DocumentType | null
}): DocumentType[] {
  const ocupados = new Set(usados.filter((t) => t !== incluir))
  const lista = DOCUMENT_TYPES_ELEGIBLES.filter((t) => t === 'otro' || !ocupados.has(t))
  // Un tipo descontinuado no está en ELEGIBLES: se agrega al final para que el
  // documento que ya lo tiene no lo pierda al editarse.
  if (incluir && !lista.includes(incluir)) lista.push(incluir)
  return lista
}
