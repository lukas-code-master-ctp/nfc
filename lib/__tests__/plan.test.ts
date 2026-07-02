import { describe, it, expect } from 'vitest'
import { maxVehiculosDe } from '@/lib/plan'

describe('maxVehiculosDe', () => {
  it('respeta mínimo 1 y piso entero', () => {
    expect(maxVehiculosDe({ maxVehiculos: 5 })).toBe(5)
    expect(maxVehiculosDe({ maxVehiculos: 0 })).toBe(1)
    expect(maxVehiculosDe({ maxVehiculos: 3.9 })).toBe(3)
  })
})
