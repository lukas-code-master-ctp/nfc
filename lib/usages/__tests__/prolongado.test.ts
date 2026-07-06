import { describe, it, expect } from 'vitest'
import { horasEnUso, usoProlongado, parseAvisoUsoHoras } from '@/lib/usages/prolongado'

const now = new Date('2026-07-06T12:00:00.000Z')

describe('horasEnUso', () => {
  it('calcula las horas transcurridas', () => {
    expect(horasEnUso('2026-07-06T00:00:00.000Z', now)).toBe(12)
  })
})

describe('usoProlongado', () => {
  it('falso bajo el umbral', () => {
    expect(usoProlongado('2026-07-06T02:00:00.000Z', 12, now)).toBe(false) // 10h
  })
  it('verdadero justo en el umbral (inclusivo)', () => {
    expect(usoProlongado('2026-07-06T00:00:00.000Z', 12, now)).toBe(true) // 12h exactas
  })
  it('verdadero sobre el umbral', () => {
    expect(usoProlongado('2026-07-05T12:00:00.000Z', 12, now)).toBe(true) // 24h
  })
  it('usa el umbral recibido (config por empresa)', () => {
    expect(usoProlongado('2026-07-06T04:00:00.000Z', 6, now)).toBe(true) // 8h >= 6
    expect(usoProlongado('2026-07-06T04:00:00.000Z', 24, now)).toBe(false) // 8h < 24
  })
})

describe('parseAvisoUsoHoras', () => {
  it('acepta enteros >= 1', () => {
    expect(parseAvisoUsoHoras(8)).toBe(8)
    expect(parseAvisoUsoHoras('24')).toBe(24)
  })
  it('marca ausente cuando es undefined/null', () => {
    expect(parseAvisoUsoHoras(undefined)).toBe('absent')
    expect(parseAvisoUsoHoras(null)).toBe('absent')
  })
  it('marca inválido cuando es < 1 o no entero', () => {
    expect(parseAvisoUsoHoras(0)).toBe('invalid')
    expect(parseAvisoUsoHoras(-3)).toBe('invalid')
    expect(parseAvisoUsoHoras(2.5)).toBe('invalid')
    expect(parseAvisoUsoHoras('abc')).toBe('invalid')
  })
})
