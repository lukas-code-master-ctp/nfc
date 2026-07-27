import { describe, it, expect, vi, beforeEach } from 'vitest'

const getTransferenciaByToken = vi.fn()
vi.mock('@/lib/data/transferencias', () => ({
  getTransferenciaByToken: (...a: unknown[]) => getTransferenciaByToken(...a),
}))

import { GET } from '@/app/api/transferencias/[token]/route'

const ctx = (token: string) => ({ params: Promise.resolve({ token }) })
const futuro = '2999-01-01T00:00:00.000Z'

const completa = {
  id: 't1', vehicleId: 'v1', patente: 'ABCD-12', deCompanyId: 'c1', deCompanyNombre: 'Uno',
  paraEmail: 'nuevo@dos.cl', token: 'tok', status: 'pendiente', creadaPorUid: 'u1',
  createdAt: futuro, expiresAt: futuro,
}

beforeEach(() => {
  getTransferenciaByToken.mockReset()
  getTransferenciaByToken.mockResolvedValue(completa)
})

describe('GET transferencia por token', () => {
  it('404 si el token no existe', async () => {
    getTransferenciaByToken.mockResolvedValue(null)
    expect((await GET({} as Request, ctx('tok'))).status).toBe(404)
  })

  it('404 si ya no está vigente', async () => {
    getTransferenciaByToken.mockResolvedValue({ ...completa, status: 'cancelada' })
    expect((await GET({} as Request, ctx('tok'))).status).toBe(404)
  })

  it('responde sin sesión con los cuatro campos acordados', async () => {
    const res = await GET({} as Request, ctx('tok'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      patente: 'ABCD-12',
      deCompanyNombre: 'Uno',
      paraEmail: 'nuevo@dos.cl',
      status: 'pendiente',
    })
  })

  it('no filtra identificadores internos', async () => {
    const data = await (await GET({} as Request, ctx('tok'))).json()
    expect(data).not.toHaveProperty('vehicleId')
    expect(data).not.toHaveProperty('deCompanyId')
    expect(data).not.toHaveProperty('creadaPorUid')
    expect(data).not.toHaveProperty('token')
  })
})
