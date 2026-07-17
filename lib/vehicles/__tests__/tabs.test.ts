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
