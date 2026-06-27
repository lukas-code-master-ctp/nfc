import { describe, it, expect } from 'vitest'
import { daysUntil, documentStatus, worstStatus } from '@/lib/documents/status'

const now = new Date('2026-06-27T12:00:00-04:00')

describe('daysUntil', () => {
  it('null cuando no hay fecha', () => {
    expect(daysUntil(null, now)).toBeNull()
  })
  it('positivo en el futuro', () => {
    expect(daysUntil('2026-07-27', now)).toBe(30)
  })
  it('cero el mismo día', () => {
    expect(daysUntil('2026-06-27', now)).toBe(0)
  })
  it('negativo si ya pasó', () => {
    expect(daysUntil('2026-06-20', now)).toBe(-7)
  })
})

describe('documentStatus', () => {
  it('sin_vencimiento cuando no hay fecha', () => {
    expect(documentStatus(null, now)).toBe('sin_vencimiento')
  })
  it('vencido cuando la fecha ya pasó', () => {
    expect(documentStatus('2026-06-26', now)).toBe('vencido')
  })
  it('por_vencer dentro de 30 días inclusive', () => {
    expect(documentStatus('2026-06-27', now)).toBe('por_vencer')
    expect(documentStatus('2026-07-27', now)).toBe('por_vencer')
  })
  it('al_dia a más de 30 días', () => {
    expect(documentStatus('2026-07-28', now)).toBe('al_dia')
  })
})

describe('worstStatus', () => {
  it('prioriza vencido', () => {
    expect(worstStatus(['al_dia', 'vencido', 'por_vencer'])).toBe('vencido')
  })
  it('por_vencer sobre al_dia', () => {
    expect(worstStatus(['al_dia', 'por_vencer'])).toBe('por_vencer')
  })
  it('al_dia si todos al día', () => {
    expect(worstStatus(['al_dia', 'al_dia'])).toBe('al_dia')
  })
  it('sin_vencimiento si lista vacía', () => {
    expect(worstStatus([])).toBe('sin_vencimiento')
  })
})
