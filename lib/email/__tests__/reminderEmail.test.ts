import { describe, it, expect } from 'vitest'
import { reminderSubject, reminderHtml } from '@/lib/email/reminderEmail'

describe('reminderSubject', () => {
  it('hito 0 indica vencido/hoy', () => {
    expect(reminderSubject('0', 'SOAP')).toContain('SOAP')
    expect(reminderSubject('0', 'SOAP').toLowerCase()).toContain('vence hoy')
  })
  it('hito 30 indica 30 días', () => {
    expect(reminderSubject('30', 'Revisión Técnica')).toContain('30 días')
  })
})

describe('reminderHtml', () => {
  it('incluye patente, etiqueta y fecha', () => {
    const html = reminderHtml({ patente: 'ABCD12', label: 'SOAP', fechaVencimiento: '2026-07-27', milestone: '30' })
    expect(html).toContain('ABCD12')
    expect(html).toContain('SOAP')
    expect(html).toContain('2026-07-27')
  })
})
