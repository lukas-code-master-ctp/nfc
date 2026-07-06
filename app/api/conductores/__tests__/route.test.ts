import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/membership', () => ({ getMembership: (...a: unknown[]) => getMembership(...a) }))
const listDrivers = vi.hoisted(() => vi.fn())
const createDriver = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/drivers', () => ({
  listDrivers: (...a: unknown[]) => listDrivers(...a),
  createDriver: (...a: unknown[]) => createDriver(...a),
}))

import { GET, POST } from '@/app/api/conductores/route'

function req(body: unknown) { return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest }

beforeEach(() => {
  getMembership.mockReset(); listDrivers.mockReset(); createDriver.mockReset()
  getMembership.mockResolvedValue({ uid: 'me', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
  createDriver.mockResolvedValue({ id: 'd9' })
})

describe('GET /api/conductores', () => {
  it('incluye el pin recuperable (o null si es un conductor antiguo)', async () => {
    listDrivers.mockResolvedValue([
      { id: 'd1', nombre: 'Ana', rut: null, activo: true, createdAt: 't', pin: '1234' },
      { id: 'd2', nombre: 'Beto', rut: null, activo: true, createdAt: 't', pin: undefined },
    ])
    const res = await GET()
    const data = await res.json()
    expect(data.drivers[0].pin).toBe('1234')
    expect(data.drivers[1].pin).toBeNull()
  })
  it('403 si no es admin', async () => {
    getMembership.mockResolvedValue({ uid: 'me', email: 'a@b.cl', companyId: 'c1', role: 'editor' })
    expect((await GET()).status).toBe(403)
  })
})

describe('POST /api/conductores', () => {
  it('crea pasando el pin', async () => {
    const res = await POST(req({ nombre: 'Ana', pin: '1234' }))
    expect(res.status).toBe(200)
    expect(createDriver).toHaveBeenCalledWith('c1', 'me', { nombre: 'Ana', rut: undefined, pin: '1234' })
  })
})
