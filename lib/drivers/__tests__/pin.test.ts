import { describe, it, expect } from 'vitest'
import {
  isValidPinFormat, hashPin, verifyPin, estaBloqueado, trasIntentoFallido, MAX_INTENTOS,
} from '@/lib/drivers/pin'

describe('isValidPinFormat', () => {
  it('acepta exactamente 4 dígitos', () => {
    expect(isValidPinFormat('1234')).toBe(true)
    expect(isValidPinFormat('12a4')).toBe(false)
    expect(isValidPinFormat('123')).toBe(false)
    expect(isValidPinFormat('12345')).toBe(false)
  })
})

describe('hashPin / verifyPin', () => {
  it('el hash no es el PIN y verify distingue', () => {
    const h = hashPin('1234')
    expect(h).not.toContain('1234')
    expect(verifyPin('1234', h)).toBe(true)
    expect(verifyPin('0000', h)).toBe(false)
  })
  it('verify tolera un hash malformado', () => {
    expect(verifyPin('1234', 'basura')).toBe(false)
  })
})

describe('estaBloqueado', () => {
  it('false si no hay bloqueo o ya pasó', () => {
    expect(estaBloqueado(null, 1000)).toBe(false)
    expect(estaBloqueado(new Date(500).toISOString(), 1000)).toBe(false)
  })
  it('true si el bloqueo es futuro', () => {
    expect(estaBloqueado(new Date(2000).toISOString(), 1000)).toBe(true)
  })
})

describe('trasIntentoFallido', () => {
  it('suma intentos y bloquea al llegar al máximo', () => {
    expect(trasIntentoFallido(0, 1000).bloqueadoHasta).toBeNull()
    const r = trasIntentoFallido(MAX_INTENTOS - 1, 1000)
    expect(r.intentosFallidos).toBe(MAX_INTENTOS)
    expect(r.bloqueadoHasta).not.toBeNull()
  })
})
