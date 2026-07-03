import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.fn()
vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))
const deleteAlerta = vi.fn()
vi.mock('@/lib/data/alertas', () => ({ deleteAlerta: (...a: unknown[]) => deleteAlerta(...a) }))

import { DELETE } from '@/app/api/alertas/[id]/route'

function ctx(id: string) { return { params: Promise.resolve({ id }) } }
const editor = { uid: 'u1', email: 'e@b.cl', companyId: 'c1', role: 'editor' }

beforeEach(() => {
  getMembership.mockReset(); deleteAlerta.mockReset()
  getMembership.mockResolvedValue(editor)
})

describe('DELETE /api/alertas/[id]', () => {
  it('401 sin sesión', async () => {
    getMembership.mockResolvedValue(null)
    expect((await DELETE(new Request('http://x'), ctx('a1'))).status).toBe(401)
  })
  it('403 para el Visor', async () => {
    getMembership.mockResolvedValue({ ...editor, role: 'viewer' })
    expect((await DELETE(new Request('http://x'), ctx('a1'))).status).toBe(403)
  })
  it('403 si es de otra empresa', async () => {
    deleteAlerta.mockRejectedValue(new Error('forbidden'))
    expect((await DELETE(new Request('http://x'), ctx('a1'))).status).toBe(403)
  })
  it('200 atiende (borra) la alerta', async () => {
    const res = await DELETE(new Request('http://x'), ctx('a1'))
    expect(res.status).toBe(200)
    expect(deleteAlerta).toHaveBeenCalledWith('c1', 'a1')
  })
})
