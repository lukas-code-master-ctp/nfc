import { describe, it, expect } from 'vitest'
import { reminderSubject, reminderHtml } from '@/lib/email/reminderEmail'

describe('reminderSubject', () => {
  it('hito 0 indica vencido/hoy e incluye documento y patente', () => {
    const s = reminderSubject('0', 'SOAP', 'ABCD12')
    expect(s).toContain('SOAP')
    expect(s).toContain('ABCD12')
    expect(s.toLowerCase()).toContain('vence hoy')
  })
  it('hito 30 indica 30 días y va brandeado', () => {
    const s = reminderSubject('30', 'Revisión Técnica', 'ABCD12')
    expect(s).toContain('30 días')
    expect(s).toContain('TapCar')
  })
})

describe('reminderHtml', () => {
  const html = reminderHtml({
    patente: 'ABCD12',
    label: 'SOAP',
    fechaVencimiento: '2026-07-27',
    milestone: '30',
    vehicleId: 'v123',
  })
  it('incluye patente, etiqueta y fecha', () => {
    expect(html).toContain('ABCD12')
    expect(html).toContain('SOAP')
    expect(html).toContain('2026-07-27')
  })
  it('lleva CTA al vehículo y va brandeado', () => {
    expect(html).toContain('/vehiculos/v123')
    expect(html).toContain('Actualizar en TapCar')
    expect(html).toContain('Tap<span')
  })
})
