import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockWhere = vi.fn(() => ({ limit: () => ({ get: mockGet }) }))
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ where: mockWhere }) },
  adminBucket: {},
}))

import { getVehicleByToken } from '@/lib/data/vehicles'

beforeEach(() => {
  mockGet.mockReset()
  mockWhere.mockClear()
})

describe('getVehicleByToken', () => {
  it('devuelve null si no hay match', async () => {
    mockGet.mockResolvedValue({ empty: true, docs: [] })
    expect(await getVehicleByToken('nope')).toBeNull()
  })

  it('devuelve el vehículo cuando hay match', async () => {
    mockGet.mockResolvedValue({
      empty: false,
      docs: [{ id: 'v1', data: () => ({ ownerUid: 'a', patente: 'ABCD12', publicToken: 'tok' }) }],
    })
    const v = await getVehicleByToken('tok')
    expect(v?.id).toBe('v1')
    expect(v?.patente).toBe('ABCD12')
    expect(mockWhere).toHaveBeenCalledWith('publicToken', '==', 'tok')
  })
})
