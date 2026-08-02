import { describe, it, expect } from 'vitest'
import { faseDelPlan } from '@/lib/plan/fase'

describe('faseDelPlan', () => {
  it('dentro de la prueba es prueba', () => {
    expect(faseDelPlan({ gratisHasta: '2026-08-31', promoHasta: '2026-11-30' }, '2026-08-15')).toBe('prueba')
  })

  // Borde inclusivo: el último día de prueba TODAVÍA es prueba, igual que
  // `estadoPrueba` trata el día 0 como "termina hoy" y no como vencida.
  it('el último día de prueba sigue siendo prueba', () => {
    expect(faseDelPlan({ gratisHasta: '2026-08-31', promoHasta: '2026-11-30' }, '2026-08-31')).toBe('prueba')
  })

  it('al día siguiente pasa a promo', () => {
    expect(faseDelPlan({ gratisHasta: '2026-08-31', promoHasta: '2026-11-30' }, '2026-09-01')).toBe('promo')
  })

  it('el último día de promo sigue siendo promo', () => {
    expect(faseDelPlan({ gratisHasta: '2026-08-31', promoHasta: '2026-11-30' }, '2026-11-30')).toBe('promo')
  })

  it('después de la promo es plena', () => {
    expect(faseDelPlan({ gratisHasta: '2026-08-31', promoHasta: '2026-11-30' }, '2026-12-01')).toBe('plena')
  })

  it('sin promo, al terminar la prueba pasa directo a plena', () => {
    expect(faseDelPlan({ gratisHasta: '2026-08-31' }, '2026-09-01')).toBe('plena')
  })

  it('sin ninguna fecha es plena', () => {
    expect(faseDelPlan({}, '2026-09-01')).toBe('plena')
  })

  // Una cuenta que canjeó con la prueba ya vencida: no hay gratisHasta vigente
  // pero sí promo.
  it('con la prueba vencida y promo vigente, es promo', () => {
    expect(faseDelPlan({ gratisHasta: '2026-07-01', promoHasta: '2026-11-30' }, '2026-09-01')).toBe('promo')
  })
})
