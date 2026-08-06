import { describe, it, expect } from 'vitest'
import {
  dueReminder,
  ventanaRecordatorios,
  VENTANA_ADELANTE_DIAS,
  VENTANA_ATRAS_DIAS,
} from '@/lib/documents/reminders'
import { REMINDER_MILESTONES } from '@/lib/types'
import { daysUntil } from '@/lib/documents/status'

const now = new Date('2026-06-27T12:00:00-04:00')

describe('ventanaRecordatorios', () => {
  it('llega más lejos que el hito más lejano', () => {
    // Si alguien agrega un hito de 60 días sin ampliar la ventana, el cron
    // dejaría de ver esos documentos y el recordatorio no saldría nunca.
    expect(VENTANA_ADELANTE_DIAS).toBeGreaterThan(Math.max(...REMINDER_MILESTONES))
  })

  it('cubre todo documento que dueReminder consideraría', () => {
    const { desde, hasta } = ventanaRecordatorios(now)
    // Un documento en el borde de adelante todavía entra, y a esa distancia
    // ningún hito está alcanzado — o sea, la ventana sobra por ese lado.
    expect(daysUntil(hasta, now)).toBeGreaterThanOrEqual(Math.max(...REMINDER_MILESTONES))
    expect(desde < hasta).toBe(true)
  })

  // El hito 0 sigue pendiente mientras no se envíe, así que cortar en hoy
  // dejaría fuera para siempre a un documento cargado ya vencido, o a uno que
  // quedó sin avisar porque el cron falló ese día.
  it('mira hacia atrás, no corta en hoy', () => {
    const { desde } = ventanaRecordatorios(now)
    expect(daysUntil(desde, now)).toBeLessThan(0)
    expect(VENTANA_ATRAS_DIAS).toBeGreaterThanOrEqual(365)
  })

  it('un documento vencido ayer sigue dentro de la ventana', () => {
    const { desde, hasta } = ventanaRecordatorios(now)
    const ayer = '2026-06-26'
    expect(ayer >= desde && ayer <= hasta).toBe(true)
    expect(dueReminder(ayer, [], now)).toBe('0')
  })

  it('deja fuera lo que vence mucho después: es todo el ahorro', () => {
    const { hasta } = ventanaRecordatorios(now)
    const enSeisMeses = '2026-12-27'
    expect(enSeisMeses > hasta).toBe(true)
    // Y es correcto dejarlo fuera, porque hoy no le tocaría ningún hito.
    expect(dueReminder(enSeisMeses, [], now)).toBeNull()
  })

  it('devuelve fechas YYYY-MM-DD comparables como strings', () => {
    const { desde, hasta } = ventanaRecordatorios(now)
    for (const f of [desde, hasta]) expect(f).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

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
