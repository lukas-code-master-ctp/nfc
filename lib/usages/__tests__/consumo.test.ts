import { describe, it, expect } from 'vitest'
import { sanitizeConsumo, calcularConsumo } from '@/lib/usages/consumo'

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

describe('calcularConsumo', () => {
  const params = { rendimientoKmL: 10, estanqueLitros: 100 }

  it('marca cuando la bajada observada supera a la esperada por >= 1/4 de estanque', () => {
    // 250 km / 10 km/L = 25 L esperados = 0.25 del estanque; observado Lleno->1/2 = 0.5. Discrepancia 0.25.
    const r = calcularConsumo({ km: 1250, bencina: '1/2' }, { km: 1000, bencina: 'Lleno' }, params)
    expect(r).not.toBeNull()
    expect(r!.revisar).toBe(true)
    expect(r!.kmRecorridos).toBe(250)
    expect(r!.litrosEsperados).toBeCloseTo(25)
    expect(r!.litrosObservados).toBeCloseTo(50)
  })

  it('no marca cuando la bajada es acorde a los km', () => {
    // Lleno->3/4 = 0.25 observado, esperado 0.25. Discrepancia 0.
    const r = calcularConsumo({ km: 1250, bencina: '3/4' }, { km: 1000, bencina: 'Lleno' }, params)
    expect(r).not.toBeNull()
    expect(r!.revisar).toBe(false)
  })

  it('devuelve null sin uso previo', () => {
    expect(calcularConsumo({ km: 1250, bencina: '1/2' }, null, params)).toBe(null)
  })

  it('devuelve null si falta una lectura (km o bencina)', () => {
    expect(calcularConsumo({ km: null, bencina: '1/2' }, { km: 1000, bencina: 'Lleno' }, params)).toBe(null)
    expect(calcularConsumo({ km: 1250, bencina: null }, { km: 1000, bencina: 'Lleno' }, params)).toBe(null)
    expect(calcularConsumo({ km: 1250, bencina: '1/2' }, { km: 1000, bencina: null }, params)).toBe(null)
  })

  it('devuelve null si hubo recarga (la bencina subió)', () => {
    expect(calcularConsumo({ km: 1250, bencina: 'Lleno' }, { km: 1000, bencina: '1/2' }, params)).toBe(null)
  })

  it('devuelve null en viajes demasiado cortos (< 20 km)', () => {
    expect(calcularConsumo({ km: 1010, bencina: '1/2' }, { km: 1000, bencina: 'Lleno' }, params)).toBe(null)
  })

  it('devuelve null sin params del vehículo', () => {
    expect(calcularConsumo({ km: 1250, bencina: '1/2' }, { km: 1000, bencina: 'Lleno' }, null)).toBe(null)
    expect(calcularConsumo({ km: 1250, bencina: '1/2' }, { km: 1000, bencina: 'Lleno' }, { rendimientoKmL: null, estanqueLitros: 100 })).toBe(null)
  })

  it('devuelve null si un nivel de bencina no es reconocido', () => {
    expect(calcularConsumo({ km: 1250, bencina: 'Medio' }, { km: 1000, bencina: 'Lleno' }, params)).toBe(null)
  })
})
