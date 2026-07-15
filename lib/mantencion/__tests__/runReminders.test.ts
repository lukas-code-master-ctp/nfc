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
})
