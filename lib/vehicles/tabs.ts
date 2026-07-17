export type TabFicha = 'documentos' | 'vehiculo' | 'bitacora' | 'ajustes'

/** Orden de las pestañas en la ficha del vehículo. */
export const TABS_FICHA: readonly TabFicha[] = ['documentos', 'vehiculo', 'bitacora', 'ajustes']

/**
 * Resuelve la pestaña activa (y un posible destino de scroll) a partir del hash
 * de la URL. Un hash `uso-{id}` (enlace profundo a un uso desde la pill del
 * dashboard o el email de daño) abre la Bitácora y pide scroll a ese uso.
 * Cualquier hash vacío o desconocido cae en Documentos.
 */
export function tabDesdeHash(hash: string): { tab: TabFicha; scrollA: string | null } {
  const limpio = hash.replace(/^#/, '')
  if ((TABS_FICHA as readonly string[]).includes(limpio)) {
    return { tab: limpio as TabFicha, scrollA: null }
  }
  if (limpio.startsWith('uso-')) {
    return { tab: 'bitacora', scrollA: limpio }
  }
  return { tab: 'documentos', scrollA: null }
}
