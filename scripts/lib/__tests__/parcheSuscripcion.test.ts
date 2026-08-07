import { describe, it, expect } from 'vitest'
import { calcularParche, LANZAMIENTO_HASTA, addDias } from '../parcheSuscripcion.mjs'
import { LANZAMIENTO_HASTA as LANZAMIENTO_HASTA_APP, addDias as addDiasApp } from '@/lib/plan/prueba'
import { suscripcionInicial } from '@/lib/types'

// `scripts/migrar-suscripciones.mjs` es un `.mjs`: no puede importar el
// TypeScript de `lib/`, así que `scripts/lib/parcheSuscripcion.mjs` DUPLICA
// `LANZAMIENTO_HASTA` y `addDias` de `lib/plan/prueba.ts`. Al revés sí se
// puede (un test en TypeScript puede importar un `.mjs` sin problema), así
// que en vez de repetir también la lógica de `calcularParche` — como hace
// `scripts/normalizar-marcas.mjs` con `normalizarMarca`, verificado luego con
// una extracción por regex — este módulo pure la expone directo y el test de
// abajo importa la función real, sin duplicarla ni re-ejecutarla en sandbox.
// Lo único que queda duplicado es la fecha y el helper de fechas, y esta
// guarda es la que falla si las dos copias se separan.
describe('el módulo del script no se desvía de la app', () => {
  it('LANZAMIENTO_HASTA es idéntica a la de lib/plan/prueba.ts', () => {
    expect(LANZAMIENTO_HASTA).toBe(LANZAMIENTO_HASTA_APP)
  })

  it('addDias se comporta igual que el de lib/plan/prueba.ts', () => {
    const casos: Array<[string, number]> = [
      ['2026-09-01', 1],
      ['2026-01-31', 1], // cambio de mes
      ['2026-12-31', 1], // cambio de año
      ['2026-02-28', 1], // no bisiesto
      ['2028-02-28', 1], // bisiesto
      ['2026-09-01', 0],
      ['2026-09-01', 30],
    ]
    for (const [fecha, dias] of casos) {
      expect(addDias(fecha, dias), `addDias(${fecha}, ${dias})`).toBe(addDiasApp(fecha, dias))
    }
  })
})

describe('calcularParche', () => {
  it('empresa sin gratisHasta: lo nivela a LANZAMIENTO_HASTA', () => {
    const patch = calcularParche({})
    expect(patch['plan.gratisHasta']).toBe(LANZAMIENTO_HASTA)
  })

  it('empresa con gratisHasta ANTERIOR: lo nivela a LANZAMIENTO_HASTA', () => {
    const patch = calcularParche({ gratisHasta: '2026-08-15' })
    expect(patch['plan.gratisHasta']).toBe(LANZAMIENTO_HASTA)
  })

  it('empresa con gratisHasta POSTERIOR: la deja intacta (ya le prometieron más)', () => {
    const patch = calcularParche({ gratisHasta: '2026-12-25', periodicidad: 'mensual', suscripcion: algunaSuscripcion() })
    expect('plan.gratisHasta' in patch).toBe(false)
  })

  it('empresa con gratisHasta === LANZAMIENTO_HASTA: la deja intacta (ya está al día)', () => {
    const patch = calcularParche({
      gratisHasta: LANZAMIENTO_HASTA,
      periodicidad: 'mensual',
      suscripcion: algunaSuscripcion(),
    })
    expect('plan.gratisHasta' in patch).toBe(false)
  })

  it('periodicidad ausente: se fija a null', () => {
    const patch = calcularParche({})
    expect(patch['plan.periodicidad']).toBe(null)
  })

  it('periodicidad ya en null: se deja intacta', () => {
    const patch = calcularParche({ periodicidad: null, gratisHasta: LANZAMIENTO_HASTA, suscripcion: algunaSuscripcion() })
    expect('plan.periodicidad' in patch).toBe(false)
  })

  it('periodicidad con un valor real: se deja intacta', () => {
    const patch = calcularParche({ periodicidad: 'anual', gratisHasta: LANZAMIENTO_HASTA, suscripcion: algunaSuscripcion() })
    expect('plan.periodicidad' in patch).toBe(false)
  })

  it('suscripcion ausente: se siembra con proximoCobro = el día siguiente al último día gratis', () => {
    // `toEqual` contra la función real (no un literal a mano) es lo que
    // detecta que la copia del script (`suscripcionInicial` en
    // parcheSuscripcion.mjs) se desvió de `lib/types.ts`: un campo nuevo en
    // el tipo `Suscripcion` que la copia no siembre queda estructuralmente
    // incompleto, y un literal a mano no lo habría notado.
    const patch = calcularParche({})
    expect(patch['plan.suscripcion']).toEqual(suscripcionInicial(addDias(LANZAMIENTO_HASTA, 1)))
  })

  it('suscripcion ausente, con gratisHasta ya posterior: proximoCobro usa esa fecha, no la de lanzamiento', () => {
    const patch = calcularParche({ gratisHasta: '2026-12-25', periodicidad: 'mensual' })
    expect(patch['plan.suscripcion'].proximoCobro).toBe(addDias('2026-12-25', 1))
  })

  it('suscripcion ya presente: se deja intacta', () => {
    const patch = calcularParche({
      gratisHasta: LANZAMIENTO_HASTA,
      periodicidad: 'mensual',
      suscripcion: algunaSuscripcion(),
    })
    expect('plan.suscripcion' in patch).toBe(false)
  })

  it('una empresa que no necesita ningún cambio produce un parche vacío (idempotencia)', () => {
    const patch = calcularParche({
      gratisHasta: LANZAMIENTO_HASTA,
      periodicidad: 'mensual',
      suscripcion: algunaSuscripcion(),
    })
    expect(patch).toEqual({})
  })

  it('una empresa que no necesita ningún cambio, con gratisHasta posterior, también da parche vacío', () => {
    const patch = calcularParche({
      gratisHasta: '2027-01-01',
      periodicidad: null,
      suscripcion: algunaSuscripcion(),
    })
    expect(patch).toEqual({})
  })

  it('plan ausente (documento sin campo plan) se trata como {}', () => {
    const patch = calcularParche(undefined)
    expect(patch['plan.gratisHasta']).toBe(LANZAMIENTO_HASTA)
    expect(patch['plan.periodicidad']).toBe(null)
    expect(patch['plan.suscripcion'].proximoCobro).toBe(addDias(LANZAMIENTO_HASTA, 1))
  })
})

function algunaSuscripcion() {
  return {
    flowCustomerId: 'cus_123',
    tarjeta: null,
    cicloDesde: '2026-09-02',
    proximoCobro: '2026-10-02',
    impagoDesde: null,
    cupoProximoCiclo: null,
    cancelaEn: null,
  }
}
