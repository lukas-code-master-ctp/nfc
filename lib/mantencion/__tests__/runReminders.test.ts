import { describe, it, expect, vi } from 'vitest'
import { processMantencionReminders } from '@/lib/mantencion/runReminders'

describe('processMantencionReminders', () => {
  it('envía solo hitos nuevos y marca el hito', async () => {
    const sendMantencionEmail = vi.fn().mockResolvedValue(undefined)
    const markHito = vi.fn().mockResolvedValue(undefined)
    const now = new Date('2026-07-09T12:00:00Z')
    const res = await processMantencionReminders({
      allCompanies: async () => [{ id: 'c1', ownerUid: 'o1', pauta: { cadaMeses: 6 } }],
      vehiclesOf: async () => [
        { id: 'v1', companyId: 'c1', patente: 'AA', pautaMantencion: null, kmActual: null, mantencionReminders: [] } as never,
        { id: 'v2', companyId: 'c1', patente: 'BB', pautaMantencion: null, kmActual: null, mantencionReminders: ['vencida'] } as never,
      ],
      ultimaMantencion: async () => ({ km: null, fecha: '2026-01-01' }), // próxima era 2026-07-01 → vencida
      recipients: async () => ['a@b.cl'],
      sendMantencionEmail,
      markHito,
    }, now)
    expect(res.sent).toBe(1) // v1 manda 'vencida'; v2 ya lo tenía
    expect(sendMantencionEmail).toHaveBeenCalledTimes(1)
    expect(markHito).toHaveBeenCalledWith('v1', 'c1', ['vencida'])
  })

  // El cron corre todos los días sobre toda la plataforma: consultar la última
  // mantención por vehículo era el costo fijo más caro que tenía.
  describe('usa el resumen guardado del vehículo', () => {
    const now = new Date('2026-07-09T12:00:00Z')
    const base = {
      allCompanies: async () => [{ id: 'c1', ownerUid: 'o1', pauta: { cadaMeses: 6 } }],
      recipients: async () => ['a@b.cl'],
      sendMantencionEmail: vi.fn().mockResolvedValue(undefined),
      markHito: vi.fn().mockResolvedValue(undefined),
    }

    it('no consulta si el vehículo trae resumen', async () => {
      const ultimaMantencion = vi.fn()
      const res = await processMantencionReminders({
        ...base,
        vehiclesOf: async () => [{
          id: 'v1', companyId: 'c1', patente: 'AA', pautaMantencion: null, kmActual: null,
          mantencionReminders: [], resumenMantencion: { ultima: { km: null, fecha: '2026-01-01' } },
        } as never],
        ultimaMantencion,
      }, now)
      expect(ultimaMantencion).not.toHaveBeenCalled()
      expect(res.sent).toBe(1) // y llega al mismo resultado que consultando
    })

    it('consulta solo si el vehículo NO tiene resumen', async () => {
      const ultimaMantencion = vi.fn().mockResolvedValue({ km: null, fecha: '2026-01-01' })
      await processMantencionReminders({
        ...base,
        vehiclesOf: async () => [{
          id: 'v1', companyId: 'c1', patente: 'AA', pautaMantencion: null,
          kmActual: null, mantencionReminders: [],
        } as never],
        ultimaMantencion,
      }, now)
      expect(ultimaMantencion).toHaveBeenCalledWith('v1')
    })

    // `{ ultima: null }` es "calculado, no tiene mantenciones". Si se tratara
    // como ausente, este vehículo pagaría la consulta para siempre.
    it('un resumen con ultima null tampoco consulta', async () => {
      const ultimaMantencion = vi.fn()
      await processMantencionReminders({
        ...base,
        vehiclesOf: async () => [{
          id: 'v1', companyId: 'c1', patente: 'AA', pautaMantencion: null, kmActual: null,
          mantencionReminders: [], resumenMantencion: { ultima: null },
        } as never],
        ultimaMantencion,
      }, now)
      expect(ultimaMantencion).not.toHaveBeenCalled()
    })
  })
})
