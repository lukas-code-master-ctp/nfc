import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockAdd = vi.fn()
const mockWhere = vi.fn(() => ({ get: mockGet, limit: () => ({ get: mockGet }) }))
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ where: mockWhere, add: mockAdd }) },
}))

import { getTransferenciaByToken, getPendienteByVehicle } from '@/lib/data/transferencias'

const futuro = '2999-01-01T00:00:00.000Z'
const pasado = '2000-01-01T00:00:00.000Z'

const doc = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  data: () => ({
    vehicleId: 'v1',
    patente: 'ABCD-12',
    deCompanyId: 'c1',
    deCompanyNombre: 'Uno',
    paraEmail: 'a@b.cl',
    token: 'tok',
    status: 'pendiente',
    creadaPorUid: 'u1',
    createdAt: pasado,
    expiresAt: futuro,
    ...over,
  }),
})

beforeEach(() => {
  mockGet.mockReset()
  mockAdd.mockReset()
  mockWhere.mockClear()
})

describe('getTransferenciaByToken', () => {
  it('devuelve null si no existe', async () => {
    mockGet.mockResolvedValue({ empty: true, docs: [] })
    expect(await getTransferenciaByToken('tok')).toBeNull()
  })

  it('mapea el documento, incluso si ya no está pendiente', async () => {
    mockGet.mockResolvedValue({ empty: false, docs: [doc('t1', { status: 'aceptada' })] })
    const t = await getTransferenciaByToken('tok')
    expect(t?.id).toBe('t1')
    expect(t?.status).toBe('aceptada')
    expect(t?.patente).toBe('ABCD-12')
  })
})

describe('getPendienteByVehicle', () => {
  it('ignora las expiradas', async () => {
    mockGet.mockResolvedValue({ docs: [doc('t1', { expiresAt: pasado })] })
    expect(await getPendienteByVehicle('v1')).toBeNull()
  })

  it('ignora las canceladas y aceptadas', async () => {
    mockGet.mockResolvedValue({ docs: [doc('t1', { status: 'cancelada' }), doc('t2', { status: 'aceptada' })] })
    expect(await getPendienteByVehicle('v1')).toBeNull()
  })

  it('devuelve la pendiente vigente', async () => {
    mockGet.mockResolvedValue({ docs: [doc('t1', { status: 'cancelada' }), doc('t2')] })
    expect((await getPendienteByVehicle('v1'))?.id).toBe('t2')
  })
})
