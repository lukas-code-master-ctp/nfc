import { describe, it, expect } from 'vitest'
import { usageAlertSubject, usageAlertHtml } from '@/lib/email/usageAlertEmail'

describe('usageAlertSubject', () => {
  it('incluye la patente', () => {
    expect(usageAlertSubject('ABCD12')).toContain('ABCD12')
  })
})

describe('usageAlertHtml', () => {
  it('incluye conductor y patente', () => {
    const html = usageAlertHtml({ patente: 'ABCD12', driverNombre: 'Ana', tomadoEn: '2026-07-03T10:00:00.000Z' })
    expect(html).toContain('ABCD12')
    expect(html).toContain('Ana')
  })
  it('con entregadoPorNombre indica que lo entregó otro conductor', () => {
    const html = usageAlertHtml({ patente: 'ABCD12', driverNombre: 'Ana', tomadoEn: '2026-07-03T10:00:00.000Z', entregadoPorNombre: 'Beto' })
    expect(html).toContain('Beto')
    expect(html).toContain('Ana')
    expect(html).not.toContain('se volvió a tomar')
  })
  it('sin entregadoPorNombre mantiene el copy de force-close', () => {
    const html = usageAlertHtml({ patente: 'ABCD12', driverNombre: 'Ana', tomadoEn: '2026-07-03T10:00:00.000Z' })
    expect(html).toContain('se volvió a tomar')
  })
})
