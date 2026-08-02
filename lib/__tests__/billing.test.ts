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
      montoPleno: 29900,
      vehiculosCobrados: 10,
      porVehiculo: 2990,
      unidad: 'mes',
    })
  })

  it('cobra el anual una vez al año', () => {
    expect(cargoDe({ vehiculos: 10, periodicidad: 'anual' })).toEqual({
      monto: 233280,
      montoPleno: 233280,
      vehiculosCobrados: 10,
      porVehiculo: 23328,
      unidad: 'año',
    })
  })

  it('sanea la cantidad: nunca negativa, siempre entera', () => {
    expect(cargoDe({ vehiculos: -5, periodicidad: 'mensual' }).monto).toBe(0)
    expect(cargoDe({ vehiculos: 2.7, periodicidad: 'mensual' }).monto).toBe(5980)
  })
})

describe('cargoDe con cobertura promocional', () => {
  it('descuenta los vehículos cubiertos', () => {
    const c = cargoDe({ vehiculos: 8, periodicidad: 'mensual', vehiculosIncluidos: 5 })
    expect(c.vehiculosCobrados).toBe(3)
    expect(c.monto).toBe(8970)
    expect(c.montoPleno).toBe(23920)
  })

  it('si la cobertura alcanza para todos, no se cobra nada', () => {
    const c = cargoDe({ vehiculos: 3, periodicidad: 'mensual', vehiculosIncluidos: 5 })
    expect(c.vehiculosCobrados).toBe(0)
    expect(c.monto).toBe(0)
    expect(c.montoPleno).toBe(8970)
  })

  it('cubre también en anual', () => {
    const c = cargoDe({ vehiculos: 8, periodicidad: 'anual', vehiculosIncluidos: 5 })
    expect(c.monto).toBe(69984)
    expect(c.montoPleno).toBe(186624)
  })

  // La garantía de que los cinco llamadores que ya existen no cambiaron de
  // comportamiento al crecer la firma.
  it('sin cobertura, monto y montoPleno son el mismo número', () => {
    const c = cargoDe({ vehiculos: 8, periodicidad: 'mensual' })
    expect(c.monto).toBe(c.montoPleno)
    expect(c.vehiculosCobrados).toBe(8)
  })

  it('una cobertura negativa o basura no infla el cargo', () => {
    expect(cargoDe({ vehiculos: 5, periodicidad: 'mensual', vehiculosIncluidos: -3 }).monto).toBe(14950)
  })
})

describe('ahorroAnual', () => {
  // Este es el test que avisa si alguien cambia un precio en un solo lado:
  // $125.520 es el ahorro que promete tapcar.cl/planes para 10 vehículos.
  it('coincide con el número publicado en la web', () => {
    expect(ahorroAnual(10)).toBe(125520)
  })

  // El caso con 0 vehículos pasa con cualquier implementación que multiplique
  // por `vehiculos` (0 × cualquier cosa = 0) y no prueba nada del cálculo. Un
  // vehículo sí lo hace: verifica el valor exacto contra el precio publicado.
  it('con 1 vehículo es la diferencia anual entre mensual y anual', () => {
    expect(ahorroAnual(1)).toBe(12552)
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
