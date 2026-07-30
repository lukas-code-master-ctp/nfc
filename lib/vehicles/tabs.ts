export type TabFicha = 'documentos' | 'vehiculo' | 'bitacora' | 'ajustes'

/** Orden de las pestañas en la ficha del vehículo. */
export const TABS_FICHA: readonly TabFicha[] = ['documentos', 'vehiculo', 'bitacora', 'ajustes']

/**
 * Resuelve la pestaña activa (y un posible destino de scroll) a partir del hash
 * de la URL. Un hash `uso-{id}` (enlace profundo a un uso desde la pill del
 * dashboard o el email de daño) abre la Bitácora y pide scroll a ese uso. El
 * hash `mantencion` (desde la card del dashboard) abre la pestaña Vehículo y
 * pide scroll al panel de Mantención. Cualquier hash vacío o
 * desconocido cae en Documentos.
 *
 * **Se queda con el ÚLTIMO segmento del fragmento**, no con todo: Next deja el
 * fragmento acumulado al navegar a una ruta que ya estaba en su caché. Medido
 * en el navegador: yendo a `#ajustes` desde el dashboard, después de haber
 * visitado `#documentos`, la URL queda en `#documentos#ajustes` y el componente
 * se remonta con ese valor. Parseando el fragmento entero no calzaba con
 * ninguna pestaña y caía en Documentos — el paso "Vincula el chip NFC" abría la
 * sección equivocada.
 */
export function tabDesdeHash(hash: string): { tab: TabFicha; scrollA: string | null } {
  const limpio = hash.split('#').filter(Boolean).pop() ?? ''
  if ((TABS_FICHA as readonly string[]).includes(limpio)) {
    return { tab: limpio as TabFicha, scrollA: null }
  }
  if (limpio.startsWith('uso-')) {
    return { tab: 'bitacora', scrollA: limpio }
  }
  if (limpio === 'mantencion') {
    return { tab: 'vehiculo', scrollA: 'mantencion' }
  }
  return { tab: 'documentos', scrollA: null }
}
