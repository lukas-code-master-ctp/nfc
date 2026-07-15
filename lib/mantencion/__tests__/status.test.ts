import { describe, it, expect } from 'vitest'
import { sanitizePauta, pautaVacia, addMeses, estadoMantencion } from '@/lib/mantencion/status'

describe('sanitizePauta', () => {
  it('acepta enteros ≥ 1 y descarta el resto', () => {
    expect(sanitizePauta({ cadaKm: 10000, cadaMeses: 6 })).toEqual({ cadaKm: 10000, cadaMeses: 6 })
    expect(sanitizePauta({ cadaKm: 0, cadaMeses: -3 })).toEqual({ cadaKm: null, cadaMeses: null })
    expect(sanitizePauta({ cadaKm: '10000' })).toEqual({ cadaKm: null, cadaMeses: null })
    expect(sanitizePauta(null)).toEqual({ cadaKm: null, cadaMeses: null })
    expect(sanitizePauta({ cadaKm: 10000.7 })).toEqual({ cadaKm: 10000, cadaMeses: null })
  })
})

describe('pautaVacia', () => {
  it('true si no hay ningún criterio', () => {
    expect(pautaVacia(null)).toBe(true)
    expect(pautaVacia({ cadaKm: null, cadaMeses: null })).toBe(true)
    expect(pautaVacia({ cadaKm: 10000 })).toBe(false)
  })
})

describe('addMeses', () => {
  it('suma meses simples', () => {
    expect(addMeses('2026-01-15', 6)).toBe('2026-07-15')
  })
  it('maneja overflow de año', () => {
    expect(addMeses('2026-10-10', 6)).toBe('2027-04-10')
  })
  it('recorta al último día del mes destino', () => {
    expect(addMeses('2026-01-31', 1)).toBe('2026-02-28')
  })
})

describe('estadoMantencion', () => {
  const now = new Date('2026-07-09T12:00:00Z')
  it('sin pauta', () => {
    expect(estadoMantencion({ pauta: null, ultima: null, kmActual: 100, now }).estado).toBe('sin_pauta')
  })
  it('con pauta pero sin registro', () => {
    expect(estadoMantencion({ pauta: { cadaKm: 10000 }, ultima: null, kmActual: 100, now }).estado).toBe('sin_registro')
  })
  it('km al día', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000 }, ultima: { km: 5000, fecha: '2026-01-01' }, kmActual: 6000, now })
    expect(r.estado).toBe('al_dia')
    expect(r.detalle.kmRestantes).toBe(9000)
  })
  it('km próxima (dentro de 1000)', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000 }, ultima: { km: 5000, fecha: '2026-01-01' }, kmActual: 14500, now })
    expect(r.estado).toBe('proxima')
    expect(r.detalle.kmRestantes).toBe(500)
  })
  it('km vencida', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000 }, ultima: { km: 5000, fecha: '2026-01-01' }, kmActual: 16000, now })
    expect(r.estado).toBe('vencida')
  })
  it('tiempo vencida', () => {
    const r = estadoMantencion({ pauta: { cadaMeses: 6 }, ultima: { km: null, fecha: '2026-01-01' }, kmActual: null, now })
    expect(r.estado).toBe('vencida') // próxima era 2026-07-01, ya pasó
  })
  it('lo que ocurra primero: gana el peor criterio', () => {
    // km al día (faltan 9000) pero tiempo vencido
    const r = estadoMantencion({ pauta: { cadaKm: 10000, cadaMeses: 6 }, ultima: { km: 5000, fecha: '2026-01-01' }, kmActual: 6000, now })
    expect(r.estado).toBe('vencida')
  })
  it('km no computable por kmActual null cae a tiempo', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000, cadaMeses: 60 }, ultima: { km: 5000, fecha: '2026-06-01' }, kmActual: null, now })
    expect(r.estado).toBe('al_dia')
  })
  it('solo km configurado pero sin kmActual → sin_registro (no computable)', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000 }, ultima: { km: 5000, fecha: '2026-01-01' }, kmActual: null, now })
    expect(r.estado).toBe('sin_registro')
  })
})
