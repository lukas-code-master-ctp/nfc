import { describe, it, expect } from 'vitest'
import { tabDesdeHash } from '@/lib/vehicles/tabs'

describe('tabDesdeHash', () => {
  it('resuelve cada hash de pestaña (con y sin #)', () => {
    expect(tabDesdeHash('#documentos')).toEqual({ tab: 'documentos', scrollA: null })
    expect(tabDesdeHash('vehiculo')).toEqual({ tab: 'vehiculo', scrollA: null })
    expect(tabDesdeHash('#bitacora')).toEqual({ tab: 'bitacora', scrollA: null })
    expect(tabDesdeHash('ajustes')).toEqual({ tab: 'ajustes', scrollA: null })
  })

  it('un hash uso-{id} abre la bitácora y pide scroll a ese uso', () => {
    expect(tabDesdeHash('#uso-abc123')).toEqual({ tab: 'bitacora', scrollA: 'uso-abc123' })
    expect(tabDesdeHash('uso-XYZ')).toEqual({ tab: 'bitacora', scrollA: 'uso-XYZ' })
  })

  it('el hash mantencion abre la pestaña Vehículo y pide scroll al panel', () => {
    expect(tabDesdeHash('#mantencion')).toEqual({ tab: 'vehiculo', scrollA: 'mantencion' })
    expect(tabDesdeHash('mantencion')).toEqual({ tab: 'vehiculo', scrollA: 'mantencion' })
  })

  it('vacío o desconocido cae en documentos', () => {
    expect(tabDesdeHash('')).toEqual({ tab: 'documentos', scrollA: null })
    expect(tabDesdeHash('#')).toEqual({ tab: 'documentos', scrollA: null })
    expect(tabDesdeHash('#loquesea')).toEqual({ tab: 'documentos', scrollA: null })
  })
})

describe('fragmento con más de un segmento (regresión)', () => {
  // Next deja el fragmento acumulado al navegar a una ruta que ya estaba en su
  // caché: yendo a #ajustes desde el dashboard, tras haber visitado #documentos,
  // la URL queda en `#documentos#ajustes` (medido en el navegador). El último
  // segmento es el destino que se acaba de pedir.
  it('toma el último segmento, no el primero', () => {
    expect(tabDesdeHash('#documentos#ajustes').tab).toBe('ajustes')
    expect(tabDesdeHash('#ajustes#documentos').tab).toBe('documentos')
  })

  it('sigue resolviendo el scroll cuando el último segmento lo pide', () => {
    expect(tabDesdeHash('#documentos#mantencion')).toEqual({ tab: 'vehiculo', scrollA: 'mantencion' })
    expect(tabDesdeHash('#ajustes#uso-abc123')).toEqual({ tab: 'bitacora', scrollA: 'uso-abc123' })
  })

  it('un segmento final desconocido sigue cayendo en Documentos', () => {
    expect(tabDesdeHash('#ajustes#loquesea').tab).toBe('documentos')
  })
})
