import { describe, it, expect } from 'vitest'
import { estadoPrueba, addDias, UMBRAL_POR_TERMINAR, LANZAMIENTO_HASTA, gratisHastaDeAlta } from '@/lib/plan/prueba'
import { hoyEnChile } from '@/lib/documents/status'
import { debeElegirPlan } from '@/lib/plan'

// 2026-08-01 12:00 UTC = 2026-08-01 en Chile.
const AHORA = new Date('2026-08-01T12:00:00Z')

describe('estadoPrueba', () => {
  it('sin fecha no hay prueba que mostrar', () => {
    expect(estadoPrueba(undefined, AHORA)).toEqual({ estado: 'sin_prueba', diasRestantes: null })
    expect(estadoPrueba(null, AHORA)).toEqual({ estado: 'sin_prueba', diasRestantes: null })
  })

  it('lejos del final está activa', () => {
    expect(estadoPrueba('2026-08-20', AHORA)).toEqual({ estado: 'activa', diasRestantes: 19 })
  })

  it('en el borde de 8 días todavía está activa', () => {
    expect(estadoPrueba('2026-08-09', AHORA).estado).toBe('activa')
  })

  it('en el borde de 7 días pasa a por terminar', () => {
    expect(estadoPrueba('2026-08-08', AHORA).estado).toBe('por_terminar')
  })

  it('el último día sigue siendo por terminar, no vencida', () => {
    expect(estadoPrueba('2026-08-01', AHORA)).toEqual({ estado: 'por_terminar', diasRestantes: 0 })
  })

  it('ayer ya está vencida', () => {
    expect(estadoPrueba('2026-07-31', AHORA)).toEqual({ estado: 'vencida', diasRestantes: -1 })
  })
})

describe('addDias', () => {
  it('cruza el fin de mes', () => {
    expect(addDias('2026-08-01', 30)).toBe('2026-08-31')
    expect(addDias('2026-08-15', 30)).toBe('2026-09-14')
  })

  it('cruza el fin de año', () => {
    expect(addDias('2026-12-20', 30)).toBe('2027-01-19')
  })

  it('respeta los años bisiestos', () => {
    expect(addDias('2028-02-01', 30)).toBe('2028-03-02')
  })
})

describe('hoyEnChile', () => {
  it('devuelve YYYY-MM-DD', () => {
    expect(hoyEnChile(AHORA)).toBe('2026-08-01')
  })

  // Chile va detrás de UTC: a las 02:00 UTC allá todavía es el día anterior.
  it('usa la zona de Chile y no UTC', () => {
    expect(hoyEnChile(new Date('2026-08-02T02:00:00Z'))).toBe('2026-08-01')
  })
})

describe('debeElegirPlan', () => {
  it('null explícito manda a la pantalla', () => {
    expect(debeElegirPlan({ maxVehiculos: 3, periodicidad: null })).toBe(true)
  })

  // El caso que protege a las cuentas que ya existían: campo ausente.
  it('el campo ausente NO manda a la pantalla', () => {
    expect(debeElegirPlan({ maxVehiculos: 3 })).toBe(false)
  })

  it('quien ya eligió no vuelve', () => {
    expect(debeElegirPlan({ maxVehiculos: 3, periodicidad: 'mensual' })).toBe(false)
  })

  it('sin plan tampoco', () => {
    expect(debeElegirPlan(undefined)).toBe(false)
  })
})

describe('constantes', () => {
  it('avisa a los 7 días', () => {
    expect(UMBRAL_POR_TERMINAR).toBe(7)
  })
})

describe('gratisHastaDeAlta', () => {
  it('durante la ventana entrega la fecha de lanzamiento', () => {
    expect(gratisHastaDeAlta('2026-08-06')).toBe(LANZAMIENTO_HASTA)
  })

  // El último día es gratis: el borde es inclusivo, igual que en faseDelPlan.
  it('el último día de la ventana todavía cuenta', () => {
    expect(gratisHastaDeAlta(LANZAMIENTO_HASTA)).toBe(LANZAMIENTO_HASTA)
  })

  // Estampar una fecha ya vencida haría que `estadoPrueba` devolviera
  // 'vencida' y la franja le dijera "tu prueba terminó" a alguien que se
  // acaba de registrar. Por eso `null` y no la constante.
  it('pasada la ventana no entrega ninguna fecha', () => {
    expect(gratisHastaDeAlta('2026-09-02')).toBeNull()
    expect(gratisHastaDeAlta('2027-01-01')).toBeNull()
  })
})

describe('estadoPrueba sigue igual', () => {
  it('sin fecha no anuncia ningún plazo', () => {
    expect(estadoPrueba(null, new Date('2026-09-05T12:00:00Z')).estado).toBe('sin_prueba')
  })
})
