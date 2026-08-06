import { describe, it, expect } from 'vitest'
import { fecha, fechaCalendario, fechaHora } from '@/lib/fecha'

describe('fechaCalendario', () => {
  it('reordena YYYY-MM-DD a dd/mm/aaaa', () => {
    expect(fechaCalendario('2026-09-01')).toBe('01/09/2026')
    expect(fechaCalendario('2026-12-31')).toBe('31/12/2026')
  })

  // El motivo de que no use `Date`: `new Date('2026-09-01')` es medianoche
  // UTC, y Chile va detrás de UTC, así que formatearlo en zona chilena
  // mostraría el 31/08. Este test es el que fija esa garantía.
  it('nunca corre el día hacia atrás', () => {
    expect(fechaCalendario('2026-01-01')).toBe('01/01/2026')
    expect(fechaCalendario('2026-03-01')).toBe('01/03/2026')
  })

  it('devuelve cadena vacía ante entrada inválida', () => {
    expect(fechaCalendario(null)).toBe('')
    expect(fechaCalendario(undefined)).toBe('')
    expect(fechaCalendario('')).toBe('')
    expect(fechaCalendario('2026-9-1')).toBe('')
    expect(fechaCalendario('mañana')).toBe('')
  })
})

describe('fecha', () => {
  it('formatea un instante en hora de Chile', () => {
    expect(fecha('2026-09-01T15:30:00Z')).toBe('01/09/2026')
  })

  // Chile va detrás de UTC, así que a las 02:00 UTC allá todavía es el día
  // anterior. Este instante es el único tipo que distingue: formatear en UTC
  // daría 02/09/2026. El caso de las 23:30 UTC que había antes NO servía —
  // es el 1 de septiembre en las dos zonas, así que pasaba con o sin
  // `timeZone`, y la garantía central del módulo quedaba sin test.
  it('respeta la zona horaria de Chile en el borde del día', () => {
    expect(fecha('2026-09-02T02:00:00Z')).toBe('01/09/2026')
  })

  it('devuelve cadena vacía ante entrada inválida', () => {
    expect(fecha(null)).toBe('')
    expect(fecha('')).toBe('')
    expect(fecha('no es una fecha')).toBe('')
  })
})

describe('fechaHora', () => {
  it('agrega la hora en 24 horas', () => {
    expect(fechaHora('2026-09-01T15:30:00Z')).toBe('01/09/2026 11:30')
  })

  // `hour12: false` produce '24:00' en algunas versiones de ICU. Este test es
  // el que obliga a usar `hourCycle: 'h23'`, y falla solo a medianoche —
  // o sea, en producción y de noche, si no estuviera.
  it('muestra la medianoche como 00:00 y no como 24:00', () => {
    expect(fechaHora('2026-09-01T04:00:00Z')).toBe('01/09/2026 00:00')
  })

  // Mismo hueco que en `fecha`: este instante es 2 de septiembre en UTC pero
  // todavía 1 de septiembre en Chile, así que solo un test que cruce la
  // medianoche en direcciones distintas según la zona prueba de verdad que
  // la FECHA (no solo la hora) de `fechaHora` use `timeZone: ZONA`.
  it('respeta la zona horaria de Chile también en la fecha, no solo en la hora', () => {
    expect(fechaHora('2026-09-02T02:15:00Z')).toBe('01/09/2026 22:15')
  })

  it('devuelve cadena vacía ante entrada inválida', () => {
    expect(fechaHora(null)).toBe('')
    expect(fechaHora('nada')).toBe('')
  })
})
