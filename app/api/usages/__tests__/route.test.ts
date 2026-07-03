import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.fn()
vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))
const updateUsageDatos = vi.fn()
vi.mock('@/lib/data/usages', () => ({ updateUsageDatos: (...a: unknown[]) => updateUsageDatos(...a) }))

import { PATCH } from '@/app/api/usages/[id]/route'

function req(body: unknown) { return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest }
function ctx(id: string) { return { params: Promise.resolve({ id }) } }

const editor = { uid: 'u1', email: 'e@b.cl', companyId: 'c1', role: 'editor' }

beforeEach(() => {
  getMembership.mockReset(); updateUsageDatos.mockReset()
  getMembership.mockResolvedValue(editor)
})

describe('PATCH /api/usages/[id]', () => {
  it('403 para el Visor', async () => {
    getMembership.mockResolvedValue({ ...editor, role: 'viewer' })
    expect((await PATCH(req({ km: 100 }), ctx('u1'))).status).toBe(403)
  })
  it('400 con bencina fuera de la enumeración', async () => {
    expect((await PATCH(req({ bencina: 'medio' }), ctx('u1'))).status).toBe(400)
  })
  it('400 con km no entero', async () => {
    expect((await PATCH(req({ km: 12.5 }), ctx('u1'))).status).toBe(400)
  })
  it('403 si el uso es de otra empresa', async () => {
    updateUsageDatos.mockRejectedValue(new Error('forbidden'))
    expect((await PATCH(req({ km: 100 }), ctx('u1'))).status).toBe(403)
  })
  it('200 corrige y llama a updateUsageDatos', async () => {
    const res = await PATCH(req({ bencina: '1/2', km: 100, limpieza: 'limpio' }), ctx('u1'))
    expect(res.status).toBe(200)
    expect(updateUsageDatos).toHaveBeenCalledWith('c1', 'u1', { bencina: '1/2', km: 100, limpieza: 'limpio' })
  })
})
