import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.fn()
vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))
const forzarCierreUsage = vi.fn()
vi.mock('@/lib/data/usages', () => ({ forzarCierreUsage: (...a: unknown[]) => forzarCierreUsage(...a) }))
const incrementDriverStats = vi.fn()
vi.mock('@/lib/data/drivers', () => ({ incrementDriverStats: (...a: unknown[]) => incrementDriverStats(...a) }))

import { POST } from '@/app/api/usages/[id]/forzar-entrega/route'
function ctx(id: string) { return { params: Promise.resolve({ id }) } }

beforeEach(() => {
  getMembership.mockReset(); forzarCierreUsage.mockReset(); incrementDriverStats.mockReset()
  getMembership.mockResolvedValue({ uid: 'r1', email: 'a@b.cl', companyId: 'c1', role: 'editor' })
  forzarCierreUsage.mockResolvedValue({ driverId: 'd1' })
})

describe('POST forzar-entrega', () => {
  it('401 sin sesión', async () => {
    getMembership.mockResolvedValue(null)
    expect((await POST({} as Request, ctx('u1'))).status).toBe(401)
  })
  it('403 para Visor', async () => {
    getMembership.mockResolvedValue({ uid: 'r1', email: 'a@b.cl', companyId: 'c1', role: 'viewer' })
    const res = await POST({} as Request, ctx('u1'))
    expect(res.status).toBe(403)
    expect(forzarCierreUsage).not.toHaveBeenCalled()
  })
  it('200 para Editor: cierra y suma sinEntrega', async () => {
    const res = await POST({} as Request, ctx('u1'))
    expect(res.status).toBe(200)
    expect(forzarCierreUsage).toHaveBeenCalledWith('c1', 'u1')
    expect(incrementDriverStats).toHaveBeenCalledWith('d1', 'sinEntrega')
  })
  it('409 si el uso ya está cerrado', async () => {
    forzarCierreUsage.mockRejectedValue(new Error('no_abierto'))
    expect((await POST({} as Request, ctx('u1'))).status).toBe(409)
  })
  it('404 si el uso no es de la empresa', async () => {
    forzarCierreUsage.mockRejectedValue(new Error('forbidden'))
    expect((await POST({} as Request, ctx('u1'))).status).toBe(404)
  })
})
