import { describe, it, expect } from 'vitest'
import { danoSubject, danoHtml } from '@/lib/email/danoEmail'

describe('danoSubject', () => {
  it('incluye patente y va brandeado', () => {
    const s = danoSubject('ABCD12')
    expect(s).toContain('ABCD12')
    expect(s).toContain('TapCar')
  })
})

describe('danoHtml', () => {
  const html = danoHtml({ patente: 'ABCD12', vehicleId: 'v1', usageId: 'u1', driverNombre: 'Ana', nota: 'Rayón' })
  it('lleva CTA al uso específico y va brandeado', () => {
    expect(html).toContain('/vehiculos/v1#uso-u1')
    expect(html).toContain('Tap<span')
  })
  it('incluye patente, conductor y nota', () => {
    expect(html).toContain('ABCD12')
    expect(html).toContain('Ana')
    expect(html).toContain('Rayón')
  })
})
