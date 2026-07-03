import { describe, it, expect, vi, beforeEach } from 'vitest'

const usageWhereGet = vi.fn()
const usageAdd = vi.fn()
const usageDocUpdate = vi.fn()
const vehicleDocUpdate = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => {
      if (name === 'vehicles') return { doc: () => ({ update: vehicleDocUpdate }) }
      return { where: () => ({ get: usageWhereGet }), add: usageAdd, doc: () => ({ update: usageDocUpdate }) }
    },
  },
}))

import { openUsage, closeUsage } from '@/lib/data/usages'

beforeEach(() => {
  usageWhereGet.mockReset(); usageAdd.mockReset(); usageDocUpdate.mockReset(); vehicleDocUpdate.mockReset()
})

describe('openUsage denormaliza usoActual', () => {
  it('setea usoActual en el vehículo al abrir', async () => {
    usageWhereGet.mockResolvedValue({ docs: [] })
    usageAdd.mockResolvedValue({ id: 'u1' })
    await openUsage('c1', 'v1', { id: 'd1', nombre: 'Ana' })
    expect(vehicleDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ usoActual: expect.objectContaining({ driverId: 'd1', driverNombre: 'Ana' }) }),
    )
  })
})

describe('closeUsage limpia usoActual', () => {
  it('pone usoActual en null al cerrar', async () => {
    usageWhereGet.mockResolvedValue({ docs: [
      { id: 'u1', data: () => ({ vehicleId: 'v1', estado: 'abierto', companyId: 'c1', tomadoEn: 't' }) },
    ] })
    await closeUsage('c1', 'v1', { id: 'd1', nombre: 'Ana' }, { tablero: 'a', cabina: 'b' })
    expect(vehicleDocUpdate).toHaveBeenCalledWith({ usoActual: null })
  })
})
