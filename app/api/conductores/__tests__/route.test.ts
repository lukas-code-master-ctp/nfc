import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.fn()
vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))

const createDriver = vi.fn()
const listDrivers = vi.fn()
vi.mock('@/lib/data/drivers', () => ({
  createDriver: (...a: unknown[]) => createDriver(...a),
  listDrivers: (...a: unknown[]) => listDrivers(...a),
}))

import { GET, POST } from '@/app/api/conductores/route'

const admin = { uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' }
function req(body: unknown) {
  return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest
}

beforeEach(() => {
  getMembership.mockReset(); createDriver.mockReset(); listDrivers.mockReset()
})

describe('GET /api/conductores', () => {
  it('403 si no es admin', async () => {
    getMembership.mockResolvedValue({ ...admin, role: 'editor' })
    expect((await GET()).status).toBe(403)
  })
  it('200 sin exponer pinHash', async () => {
    getMembership.mockResolvedValue(admin)
    listDrivers.mockResolvedValue([{ id: 'd1', nombre: 'Ana', rut: null, activo: true, createdAt: 'x', pinHash: 'SECRET' }])
    const res = await GET()
    const json = await res.json()
    expect(JSON.stringify(json)).not.toContain('SECRET')
    expect(json.drivers[0].nombre).toBe('Ana')
  })
})

describe('POST /api/conductores', () => {
  it('400 con PIN inválido', async () => {
    getMembership.mockResolvedValue(admin)
    expect((await POST(req({ nombre: 'Ana', pin: '12' }))).status).toBe(400)
  })
  it('200 crea con PIN válido', async () => {
    getMembership.mockResolvedValue(admin)
    createDriver.mockResolvedValue({ id: 'd1' })
    const res = await POST(req({ nombre: 'Ana', pin: '1234' }))
    expect(res.status).toBe(200)
    expect(createDriver).toHaveBeenCalledWith('c1', 'u1', { nombre: 'Ana', rut: undefined, pin: '1234' })
  })
})
