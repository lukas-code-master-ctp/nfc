import { describe, it, expect, vi } from 'vitest'
import { processReminders } from '@/lib/documents/runReminders'
import type { VehicleDocument } from '@/lib/types'

const now = new Date('2026-06-27T12:00:00-04:00')

function doc(over: Partial<VehicleDocument>): VehicleDocument {
  return {
    id: 'd1', vehicleId: 'v1', ownerUid: 'u1', tipo: 'soap',
    nombrePersonalizado: null, fechaVencimiento: '2026-07-27',
    fileUrl: '', filePath: '', remindersSent: [], createdAt: '', ...over,
  }
}

describe('processReminders', () => {
  it('envía y marca el hito de 30 días', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const mark = vi.fn().mockResolvedValue(undefined)
    const deps = {
      allDocuments: async () => [doc({})],
      vehicleInfo: async () => ({ patente: 'ABCD12', email: 'a@b.cl' }),
      sendReminderEmail: send,
      markReminderSent: mark,
    }
    const res = await processReminders(deps, now)
    expect(res.sent).toBe(1)
    expect(send).toHaveBeenCalledWith('a@b.cl', expect.objectContaining({ patente: 'ABCD12', milestone: '30' }))
    expect(mark).toHaveBeenCalledWith('d1', 'u1', ['30'])
  })

  it('no envía si el hito ya fue enviado', async () => {
    const send = vi.fn()
    const deps = {
      allDocuments: async () => [doc({ remindersSent: ['30'] })],
      vehicleInfo: async () => ({ patente: 'ABCD12', email: 'a@b.cl' }),
      sendReminderEmail: send,
      markReminderSent: vi.fn(),
    }
    const res = await processReminders(deps, now)
    expect(res.sent).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it('omite documentos sin fecha de vencimiento', async () => {
    const send = vi.fn()
    const deps = {
      allDocuments: async () => [doc({ fechaVencimiento: null })],
      vehicleInfo: async () => ({ patente: 'X', email: 'a@b.cl' }),
      sendReminderEmail: send,
      markReminderSent: vi.fn(),
    }
    expect((await processReminders(deps, now)).sent).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })
})
