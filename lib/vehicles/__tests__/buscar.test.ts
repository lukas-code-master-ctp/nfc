import { describe, it, expect } from 'vitest'
import { normalizarBusqueda, coincideBusqueda } from '@/lib/vehicles/buscar'

describe('normalizarBusqueda', () => {
  it('baja a minúsculas, quita acentos y colapsa espacios', () => {
    expect(normalizarBusqueda('  Citroën   C3  ')).toBe('citroen c3')
    expect(normalizarBusqueda('HÍLUX')).toBe('hilux')
  })
})

describe('coincideBusqueda', () => {
  const v = { patente: 'ABCD12', marca: 'Toyota', modelo: 'Hilux' }

  it('query vacía coincide con todos', () => {
    expect(coincideBusqueda(v, '')).toBe(true)
  })
  it('coincide por patente, marca o modelo', () => {
    expect(coincideBusqueda(v, 'abcd12')).toBe(true)
    expect(coincideBusqueda(v, 'toyota')).toBe(true)
    expect(coincideBusqueda(v, 'hilux')).toBe(true)
  })
  it('es tolerante a acentos (query ya normalizada por el caller)', () => {
    expect(coincideBusqueda({ patente: 'XX11', marca: 'Citroën', modelo: 'C3' }, normalizarBusqueda('citroën'))).toBe(true)
  })
  it('no coincide cuando no está en ningún campo', () => {
    expect(coincideBusqueda(v, 'nissan')).toBe(false)
  })
})
