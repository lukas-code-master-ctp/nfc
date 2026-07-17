import { describe, it, expect } from 'vitest'
import { sanitizeConsumo } from '@/lib/usages/consumo'

describe('sanitizeConsumo', () => {
  it('acepta números válidos', () => {
    expect(sanitizeConsumo({ rendimientoKmL: 10, estanqueLitros: 50 })).toEqual({ rendimientoKmL: 10, estanqueLitros: 50 })
  })
  it('parsea strings numéricos', () => {
    expect(sanitizeConsumo({ rendimientoKmL: '12.5', estanqueLitros: '60' })).toEqual({ rendimientoKmL: 12.5, estanqueLitros: 60 })
  })
  it('descarta valores <= 0 o no numéricos a null (por campo)', () => {
    expect(sanitizeConsumo({ rendimientoKmL: -5, estanqueLitros: 50 })).toEqual({ rendimientoKmL: null, estanqueLitros: 50 })
    expect(sanitizeConsumo({ rendimientoKmL: 10, estanqueLitros: 'abc' })).toEqual({ rendimientoKmL: 10, estanqueLitros: null })
  })
  it('devuelve null si no es objeto, o si ambos campos quedan null', () => {
    expect(sanitizeConsumo(null)).toBe(null)
    expect(sanitizeConsumo('x')).toBe(null)
    expect(sanitizeConsumo({})).toBe(null)
    expect(sanitizeConsumo({ rendimientoKmL: 0, estanqueLitros: 'abc' })).toBe(null)
  })
})
