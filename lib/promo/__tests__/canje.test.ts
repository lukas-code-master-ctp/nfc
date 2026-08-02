import { describe, it, expect } from 'vitest'
import { normalizarCodigo, puedeCanjear, aplicarCanje } from '@/lib/promo/canje'
import type { PromoCode, PromoAplicada } from '@/lib/types'

const code = (over: Partial<PromoCode> = {}): PromoCode => ({
  codigo: 'LANZAMIENTO',
  descripcion: 'Lanzamiento agosto',
  mesesGratis: 3,
  vehiculosIncluidos: 5,
  activo: true,
  expiraEn: null,
  maxCanjes: null,
  canjes: 0,
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
})

const promo: PromoAplicada = {
  codigo: 'OTRO',
  mesesGratis: 1,
  vehiculosIncluidos: 0,
  canjeadoEn: '2026-07-01T00:00:00.000Z',
  hasta: '2026-09-01',
}

describe('normalizarCodigo', () => {
  it('pasa a mayúsculas y recorta', () => {
    expect(normalizarCodigo('  lanzamiento  ')).toBe('LANZAMIENTO')
  })

  it('conserva números y guiones', () => {
    expect(normalizarCodigo('tapcar-2026')).toBe('TAPCAR-2026')
  })

  // El código es el id del documento y Firestore prohíbe la barra.
  it('descarta las barras', () => {
    expect(normalizarCodigo('a/b')).toBe('AB')
  })

  it('descarta espacios, tildes y símbolos', () => {
    expect(normalizarCodigo('promo ñandú!')).toBe('PROMOAND')
  })

  it('corta a 32 caracteres', () => {
    expect(normalizarCodigo('A'.repeat(40))).toHaveLength(32)
  })

  it('una entrada sin nada aprovechable queda vacía', () => {
    expect(normalizarCodigo('   ¡!¿?   ')).toBe('')
  })
})

describe('puedeCanjear', () => {
  it('un código sano se puede canjear', () => {
    expect(puedeCanjear({ code: code(), promoActual: null, hoy: '2026-08-01' })).toBeNull()
  })

  // El orden importa: a quien ya tiene promoción hay que decirle eso, y no
  // filtrarle de paso si el código que probó existe o no.
  it('ya_canjeado gana a no_existe', () => {
    expect(puedeCanjear({ code: null, promoActual: promo, hoy: '2026-08-01' })).toBe('ya_canjeado')
  })

  it('sin código es no_existe', () => {
    expect(puedeCanjear({ code: null, promoActual: null, hoy: '2026-08-01' })).toBe('no_existe')
  })

  it('desactivado', () => {
    expect(puedeCanjear({ code: code({ activo: false }), promoActual: null, hoy: '2026-08-01' })).toBe('inactivo')
  })

  it('el día exacto de expiraEn todavía sirve', () => {
    expect(puedeCanjear({ code: code({ expiraEn: '2026-08-01' }), promoActual: null, hoy: '2026-08-01' })).toBeNull()
  })

  it('al día siguiente de expiraEn ya no', () => {
    expect(puedeCanjear({ code: code({ expiraEn: '2026-08-01' }), promoActual: null, hoy: '2026-08-02' })).toBe('expirado')
  })

  it('agotado cuando los canjes alcanzan el tope', () => {
    expect(puedeCanjear({ code: code({ maxCanjes: 50, canjes: 50 }), promoActual: null, hoy: '2026-08-01' })).toBe('agotado')
  })

  it('con un canje menos todavía se puede', () => {
    expect(puedeCanjear({ code: code({ maxCanjes: 50, canjes: 49 }), promoActual: null, hoy: '2026-08-01' })).toBeNull()
  })

  it('maxCanjes null nunca se agota', () => {
    expect(puedeCanjear({ code: code({ maxCanjes: null, canjes: 9999 }), promoActual: null, hoy: '2026-08-01' })).toBeNull()
  })
})

describe('aplicarCanje', () => {
  it('con la prueba vigente, la promo empieza cuando la prueba termina', () => {
    const p = aplicarCanje({
      code: code(),
      gratisHasta: '2026-08-31',
      hoy: '2026-08-05',
      ahoraIso: '2026-08-05T12:00:00.000Z',
    })
    expect(p.hasta).toBe('2026-11-30')
    expect(p.codigo).toBe('LANZAMIENTO')
    expect(p.mesesGratis).toBe(3)
    expect(p.vehiculosIncluidos).toBe(5)
    expect(p.canjeadoEn).toBe('2026-08-05T12:00:00.000Z')
  })

  // Con la prueba ya vencida la promoción arranca HOY, no retroactiva: si
  // contara desde `gratisHasta`, parte de la promo se consumiría en el pasado.
  it('con la prueba vencida, la promo empieza hoy', () => {
    const p = aplicarCanje({
      code: code(),
      gratisHasta: '2026-06-30',
      hoy: '2026-08-05',
      ahoraIso: '2026-08-05T12:00:00.000Z',
    })
    expect(p.hasta).toBe('2026-11-05')
  })

  it('sin gratisHasta también empieza hoy', () => {
    const p = aplicarCanje({
      code: code(),
      gratisHasta: null,
      hoy: '2026-08-05',
      ahoraIso: '2026-08-05T12:00:00.000Z',
    })
    expect(p.hasta).toBe('2026-11-05')
  })

  it('cruza el fin de año', () => {
    const p = aplicarCanje({
      code: code({ mesesGratis: 6 }),
      gratisHasta: '2026-10-15',
      hoy: '2026-09-20',
      ahoraIso: '2026-09-20T12:00:00.000Z',
    })
    expect(p.hasta).toBe('2027-04-15')
  })

  it('un código de 0 meses deja la promo terminando el mismo día', () => {
    const p = aplicarCanje({
      code: code({ mesesGratis: 0 }),
      gratisHasta: '2026-08-31',
      hoy: '2026-08-05',
      ahoraIso: '2026-08-05T12:00:00.000Z',
    })
    expect(p.hasta).toBe('2026-08-31')
  })
})
