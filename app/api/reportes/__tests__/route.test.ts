import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.fn()
vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))
const listUsagesPage = vi.fn()
vi.mock('@/lib/data/usages', () => ({ listUsagesPage: (...a: unknown[]) => listUsagesPage(...a) }))

import { GET } from '@/app/api/reportes/usos/route'

function req(qs: string) {
  return { url: `http://x/api/reportes/usos${qs}` } as unknown as import('next/server').NextRequest
}
const m = { uid: 'u1', email: 'e@b.cl', companyId: 'c1', role: 'viewer' }

beforeEach(() => {
  getMembership.mockReset(); listUsagesPage.mockReset()
  getMembership.mockResolvedValue(m)
  listUsagesPage.mockResolvedValue({ items: [{ id: 'u1' }], nextCursor: null })
})

describe('GET /api/reportes/usos', () => {
  it('401 sin sesión', async () => {
    getMembership.mockResolvedValue(null)
    expect((await GET(req(''))).status).toBe(401)
  })
  it('400 si vienen driverId y vehicleId', async () => {
    expect((await GET(req('?driverId=d1&vehicleId=v1'))).status).toBe(400)
  })
  it('200 con items usando el companyId del servidor', async () => {
    const res = await GET(req('?driverId=d1&cursor=x'))
    expect(res.status).toBe(200)
    expect(listUsagesPage).toHaveBeenCalledWith('c1', expect.objectContaining({ driverId: 'd1', cursor: 'x' }))
    expect((await res.json()).items[0].id).toBe('u1')
  })
  it('503 si la query falla (índice faltante)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    listUsagesPage.mockRejectedValue(new Error('FAILED_PRECONDITION: index'))
    expect((await GET(req(''))).status).toBe(503)
    spy.mockRestore()
  })
  it('normaliza fechas peladas a límites de día (hasta = fin de día, desde = inicio de día)', async () => {
    await GET(req('?desde=2026-07-01&hasta=2026-07-03'))
    expect(listUsagesPage).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ desde: '2026-07-01T00:00:00.000Z', hasta: '2026-07-03T23:59:59.999Z' }),
    )
  })
})
