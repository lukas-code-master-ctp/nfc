import { describe, it, expect } from 'vitest'
import { sanitizeCategorias } from '@/lib/company/categorias'

describe('sanitizeCategorias', () => {
  it('no-array → []', () => {
    expect(sanitizeCategorias(undefined)).toEqual([])
    expect(sanitizeCategorias('x')).toEqual([])
  })
  it('trim, descarta vacíos y conserva id', () => {
    const r = sanitizeCategorias([{ id: 'a', nombre: '  Camiones  ' }, { id: 'b', nombre: '  ' }])
    expect(r).toEqual([{ id: 'a', nombre: 'Camiones' }])
  })
  it('dedup por nombre case-insensitive (conserva el primero)', () => {
    const r = sanitizeCategorias([{ id: 'a', nombre: 'Reparto' }, { id: 'b', nombre: 'reparto' }])
    expect(r).toEqual([{ id: 'a', nombre: 'Reparto' }])
  })
  it('genera id si falta', () => {
    const r = sanitizeCategorias([{ nombre: 'Ejecutivos' }])
    expect(r).toHaveLength(1)
    expect(typeof r[0].id).toBe('string')
    expect(r[0].id.length).toBeGreaterThan(0)
    expect(r[0].nombre).toBe('Ejecutivos')
  })
  it('recorta el nombre a 40 y topea en 30 categorías', () => {
    const largo = 'x'.repeat(50)
    expect(sanitizeCategorias([{ id: '1', nombre: largo }])[0].nombre).toHaveLength(40)
    const muchas = Array.from({ length: 40 }, (_, i) => ({ id: String(i), nombre: `c${i}` }))
    expect(sanitizeCategorias(muchas)).toHaveLength(30)
  })
})
