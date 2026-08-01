import { describe, it, expect } from 'vitest'
import {
  cargoDe,
  ahorroAnual,
  PRICE_PER_VEHICLE,
  PRICE_PER_VEHICLE_ANUAL_MES,
  MAX_VEHICULOS_SELF_SERVICE,
} from '@/lib/billing'
import { DEFAULT_PLAN } from '@/lib/types'

describe('cargoDe', () => {
  it('cobra el mensual por mes', () => {
    expect(cargoDe({ vehiculos: 10, periodicidad: 'mensual' })).toEqual({
      monto: 29900,
      porVehiculo: 2990,
      unidad: 'mes',
    })
  })

  it('cobra el anual una vez al año', () => {
    expect(cargoDe({ vehiculos: 10, periodicidad: 'anual' })).toEqual({
      monto: 233280,
      porVehiculo: 23328,
      unidad: 'año',
    })
  })

  it('sanea la cantidad: nunca negativa, siempre entera', () => {
    expect(cargoDe({ vehiculos: -5, periodicidad: 'mensual' }).monto).toBe(0)
    expect(cargoDe({ vehiculos: 2.7, periodicidad: 'mensual' }).monto).toBe(5980)
  })
})

describe('ahorroAnual', () => {
  // Este es el test que avisa si alguien cambia un precio en un solo lado:
  // $125.520 es el ahorro que promete tapcar.cl/planes para 10 vehículos.
  it('coincide con el número publicado en la web', () => {
    expect(ahorroAnual(10)).toBe(125520)
  })

  it('es cero sin vehículos', () => {
    expect(ahorroAnual(0)).toBe(0)
  })
})

describe('constantes', () => {
  it('el anual es 35% más barato que el mensual', () => {
    expect(Math.round((1 - PRICE_PER_VEHICLE_ANUAL_MES / PRICE_PER_VEHICLE) * 100)).toBe(35)
  })

  it('el tope de self-service es 30', () => {
    expect(MAX_VEHICULOS_SELF_SERVICE).toBe(30)
  })

  // DEFAULT_PLAN con una clave `periodicidad` rompería el marcador de
  // "ausente" para todas las cuentas anteriores al selector.
  it('DEFAULT_PLAN no trae periodicidad', () => {
    expect('periodicidad' in DEFAULT_PLAN).toBe(false)
  })
})
