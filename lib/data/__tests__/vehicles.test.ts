import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockWhere = vi.fn(() => ({ limit: () => ({ get: mockGet }), get: mockGet }))
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ where: mockWhere }) },
  adminBucket: {},
}))

import { getVehicleByToken, listVehicles } from '@/lib/data/vehicles'

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

describe('listVehicles', () => {
  it('mapea categoriaId (null si no está)', async () => {
    mockGet.mockResolvedValue({
      docs: [
        { id: 'v1', data: () => ({ companyId: 'c1', patente: 'AA', marca: 'x', modelo: 'y', anio: 2020, color: 'rojo', categoriaId: 'cat1' }) },
        { id: 'v2', data: () => ({ companyId: 'c1', patente: 'BB', marca: 'x', modelo: 'y', anio: 2020, color: 'azul' }) },
      ],
    })
    const vs = await listVehicles('c1')
    expect(vs.find((v) => v.id === 'v1')?.categoriaId).toBe('cat1')
    expect(vs.find((v) => v.id === 'v2')?.categoriaId).toBeNull()
  })
})
