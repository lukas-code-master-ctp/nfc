import { describe, it, expect } from 'vitest'
import { remainingSlots, canInvite } from '@/lib/team/capacity'

describe('remainingSlots', () => {
  it('descuenta miembros y pendientes del tope de 5', () => {
    expect(remainingSlots(1, 0)).toBe(4)
    expect(remainingSlots(3, 1)).toBe(1)
  })
  it('nunca es negativo', () => {
    expect(remainingSlots(5, 3)).toBe(0)
  })
})

describe('canInvite', () => {
  it('permite invitar mientras haya cupo', () => {
    expect(canInvite(2, 2)).toBe(true)
  })
  it('bloquea al llegar a 5', () => {
    expect(canInvite(4, 1)).toBe(false)
    expect(canInvite(5, 0)).toBe(false)
  })
})
