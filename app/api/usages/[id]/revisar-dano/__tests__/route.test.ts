import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.fn()
vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))
const marcarDanoRevisado = vi.fn()
const deleteDanoAlertaByUsage = vi.fn()
vi.mock('@/lib/data/usages', () => ({ marcarDanoRevisado: (...a: unknown[]) => marcarDanoRevisado(...a) }))
vi.mock('@/lib/data/alertas', () => ({ deleteDanoAlertaByUsage: (...a: unknown[]) => deleteDanoAlertaByUsage(...a) }))
vi.mock('@/lib/data/profile', () => ({ getProfile: () => Promise.resolve({ displayName: 'Ana', email: 'a@b.cl' }) }))

import { POST } from '@/app/api/usages/[id]/revisar-dano/route'
function ctx(id: string) { return { params: Promise.resolve({ id }) } }

beforeEach(() => {
  getMembership.mockReset(); marcarDanoRevisado.mockReset(); deleteDanoAlertaByUsage.mockReset()
  getMembership.mockResolvedValue({ uid: 'r1', email: 'a@b.cl', companyId: 'c1', role: 'viewer' })
})

describe('POST revisar-dano', () => {
  it('401 sin sesión', async () => {
    getMembership.mockResolvedValue(null)
    expect((await POST({} as Request, ctx('u1'))).status).toBe(401)
  })
  it('200 y estampa + borra alerta (cualquier rol, incl. viewer)', async () => {
    const res = await POST({} as Request, ctx('u1'))
    expect(res.status).toBe(200)
    expect(marcarDanoRevisado).toHaveBeenCalledWith('c1', 'u1', { uid: 'r1', nombre: 'Ana' })
    expect(deleteDanoAlertaByUsage).toHaveBeenCalledWith('c1', 'u1')
  })
  it('404 si marcarDanoRevisado lanza forbidden', async () => {
    marcarDanoRevisado.mockRejectedValue(new Error('forbidden'))
    expect((await POST({} as Request, ctx('u1'))).status).toBe(404)
  })
  it('409 si ya fue revisado', async () => {
    marcarDanoRevisado.mockRejectedValue(new Error('ya_revisado'))
    expect((await POST({} as Request, ctx('u1'))).status).toBe(409)
  })
})
