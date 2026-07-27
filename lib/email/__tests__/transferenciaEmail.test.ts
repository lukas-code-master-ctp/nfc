import { describe, it, expect } from 'vitest'
import {
  transferenciaRecibidaSubject,
  transferenciaRecibidaHtml,
  transferenciaEnviadaSubject,
  transferenciaEnviadaHtml,
  transferenciaAceptadaSubject,
  transferenciaAceptadaHtml,
} from '@/lib/email/transferenciaEmail'

describe('correo al destinatario', () => {
  const html = transferenciaRecibidaHtml({
    patente: 'ABCD-12',
    deCompanyNombre: 'Transportes Uno',
    deEmail: 'jefe@uno.cl',
    aceptarUrl: 'https://app.tapcar.cl/transferencias/tok',
  })

  it('el asunto lleva la patente', () => {
    expect(transferenciaRecibidaSubject('ABCD-12')).toContain('ABCD-12')
  })
  it('nombra a quién transfiere y lleva el CTA al enlace de aceptación', () => {
    expect(html).toContain('Transportes Uno')
    expect(html).toContain('https://app.tapcar.cl/transferencias/tok')
    expect(html).toContain('Revisar la transferencia')
  })
  it('avisa que vence en 7 días', () => {
    expect(html).toContain('7 días')
  })
})

describe('respaldo al emisor', () => {
  it('el asunto lleva la patente y el cuerpo el destinatario', () => {
    expect(transferenciaEnviadaSubject('ABCD-12')).toContain('ABCD-12')
    expect(transferenciaEnviadaHtml({ patente: 'ABCD-12', paraEmail: 'nuevo@dos.cl', vehicleId: 'v1' }))
      .toContain('nuevo@dos.cl')
  })
  it('el CTA apunta a la ficha del vehículo, que todavía es suyo', () => {
    expect(transferenciaEnviadaHtml({ patente: 'ABCD-12', paraEmail: 'nuevo@dos.cl', vehicleId: 'v1' }))
      .toContain('/vehiculos/v1')
  })
})

describe('aviso de aceptación al emisor', () => {
  const html = transferenciaAceptadaHtml({ patente: 'ABCD-12', paraEmail: 'nuevo@dos.cl' })
  it('el asunto lleva la patente', () => {
    expect(transferenciaAceptadaSubject('ABCD-12')).toContain('ABCD-12')
  })
  it('el CTA va al dashboard porque el vehículo ya no es suyo', () => {
    expect(html).toContain('/dashboard')
    expect(html).not.toContain('/vehiculos/')
  })
})
