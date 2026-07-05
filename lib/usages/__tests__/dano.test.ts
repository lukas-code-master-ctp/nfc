import { describe, it, expect } from 'vitest'
import { buildDano } from '@/lib/usages/dano'

describe('buildDano', () => {
  it('sin daño (hay falsy) devuelve undefined', () => {
    expect(buildDano({ hay: false })).toBeUndefined()
    expect(buildDano(undefined)).toBeUndefined()
    expect(buildDano(null)).toBeUndefined()
  })

  // Reproduce el 409: daño reportado SIN foto no debe dejar `fotoPath: undefined`
  // (Firestore rechaza undefined y el update de closeUsage lanzaba).
  it('daño con nota y sin foto: sin claves undefined', () => {
    const dano = buildDano({ hay: true, nota: 'Rayón en puerta derecha' })
    expect(dano).toEqual({ hay: true, nota: 'Rayón en puerta derecha' })
    expect(dano).not.toHaveProperty('fotoPath')
    expect(Object.values(dano!).every((v) => v !== undefined)).toBe(true)
  })

  it('daño sin nota ni foto: solo hay', () => {
    const dano = buildDano({ hay: true })
    expect(dano).toEqual({ hay: true })
    expect(Object.values(dano!).every((v) => v !== undefined)).toBe(true)
  })

  it('nota vacía o solo espacios se omite', () => {
    expect(buildDano({ hay: true, nota: '   ' })).toEqual({ hay: true })
  })

  it('daño con foto incluye fotoPath y recorta la nota a 500', () => {
    const dano = buildDano({ hay: true, nota: 'x'.repeat(600), fotoPath: 'vehicles/v1/usages/abc-dano' })
    expect(dano?.fotoPath).toBe('vehicles/v1/usages/abc-dano')
    expect(dano?.nota?.length).toBe(500)
  })

  it('ignora tipos no-string en nota/fotoPath (no los mete como undefined)', () => {
    const dano = buildDano({ hay: true, nota: 123, fotoPath: 456 })
    expect(dano).toEqual({ hay: true })
  })
})
