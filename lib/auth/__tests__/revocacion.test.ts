import { describe, it, expect } from 'vitest'
import { sesionRevocada, instanteDeCorte } from '@/lib/auth/revocacion'

/** 2026-07-31T12:00:00Z en segundos, como viene `auth_time`. */
const SEG = Math.floor(Date.parse('2026-07-31T12:00:00.000Z') / 1000)

describe('sin revocación registrada', () => {
  it('nada está revocado: el campo ausente es el caso normal', () => {
    expect(sesionRevocada(SEG, undefined)).toBe(false)
  })

  it('una fecha basura tampoco desconecta a nadie', () => {
    expect(sesionRevocada(SEG, 'no-es-una-fecha')).toBe(false)
  })
})

describe('con revocación registrada', () => {
  it('una sesión anterior al corte queda fuera', () => {
    expect(sesionRevocada(SEG, '2026-07-31T13:00:00.000Z')).toBe(true)
  })

  it('una sesión posterior al corte sigue válida', () => {
    expect(sesionRevocada(SEG, '2026-07-31T11:00:00.000Z')).toBe(false)
  })

  // Las unidades son distintas a propósito: authTime en segundos, el corte en
  // ISO. Comparar sin convertir daría siempre "revocada".
  it('compara segundos contra ISO, no números crudos', () => {
    expect(sesionRevocada(SEG, '2026-07-31T11:59:59.000Z')).toBe(false)
  })
})

describe('el borde del segundo', () => {
  // Revocas a las 12:00:00.500 y vuelves a entrar a las 12:00:00.900: tu
  // authTime se trunca a 12:00:00. Si el corte guardara los milisegundos,
  // quedarías fuera justo después de haber iniciado sesión bien.
  it('quien vuelve a entrar dentro del mismo segundo NO queda fuera', () => {
    const corte = instanteDeCorte(Date.parse('2026-07-31T12:00:00.500Z'))
    expect(sesionRevocada(SEG, corte)).toBe(false)
  })

  it('instanteDeCorte trunca los milisegundos', () => {
    expect(instanteDeCorte(Date.parse('2026-07-31T12:00:00.999Z'))).toBe('2026-07-31T12:00:00.000Z')
  })
})

describe('sin authTime', () => {
  // Falla ABIERTA a propósito: el resto de las barreras sigue en pie, y fallar
  // cerrada acá desconectaría a todos si el claim cambiara de nombre.
  it('se trata como no revocada', () => {
    expect(sesionRevocada(undefined, '2026-07-31T13:00:00.000Z')).toBe(false)
  })
})
