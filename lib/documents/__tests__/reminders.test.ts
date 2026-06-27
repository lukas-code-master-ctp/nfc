import { describe, it, expect } from 'vitest'
import { dueReminder } from '@/lib/documents/reminders'

const now = new Date('2026-06-27T12:00:00-04:00')

describe('dueReminder', () => {
  it('null sin fecha de vencimiento', () => {
    expect(dueReminder(null, [], now)).toBeNull()
  })
  it("devuelve '30' cuando faltan exactamente 30 días y no se ha enviado", () => {
    expect(dueReminder('2026-07-27', [], now)).toBe('30')
  })
  it("devuelve '7' cuando faltan 7 días o menos pero más de 0, sin enviar", () => {
    expect(dueReminder('2026-07-03', [], now)).toBe('7')
  })
  it("devuelve '0' cuando ya venció o vence hoy", () => {
    expect(dueReminder('2026-06-27', [], now)).toBe('0')
    expect(dueReminder('2026-06-20', [], now)).toBe('0')
  })
  it('no reenvía un hito ya enviado', () => {
    expect(dueReminder('2026-07-27', ['30'], now)).toBeNull()
  })
  it("a 20 días devuelve '30' si no se envió (hito 30 ya alcanzado)", () => {
    expect(dueReminder('2026-07-17', [], now)).toBe('30')
  })
  it("a 20 días con '30' enviado devuelve null (aún no llega a 7)", () => {
    expect(dueReminder('2026-07-17', ['30'], now)).toBeNull()
  })
})
