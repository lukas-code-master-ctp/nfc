import { describe, it, expect, vi, beforeEach } from 'vitest'

const getCurrentUser = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }))
const isAdminEmail = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/admin', () => ({ isAdminEmail: (...a: unknown[]) => isAdminEmail(...a) }))
vi.mock('@/lib/data/companies', () => ({ saveCompany: vi.fn() }))
const deleteCompanyCascade = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/deleteCompany', () => ({ deleteCompanyCascade: (...a: unknown[]) => deleteCompanyCascade(...a) }))

import { DELETE } from '@/app/api/admin/companies/[id]/route'

function ctx(id: string) { return { params: Promise.resolve({ id }) } }
const req = {} as import('next/server').NextRequest

beforeEach(() => {
  getCurrentUser.mockReset(); isAdminEmail.mockReset(); deleteCompanyCascade.mockReset()
  getCurrentUser.mockResolvedValue({ uid: 'me', email: 'admin@x.cl' })
  isAdminEmail.mockReturnValue(true)
})

describe('DELETE /api/admin/companies/[id]', () => {
  it('borra la empresa vía cascade', async () => {
    const res = await DELETE(req, ctx('c9'))
    expect(res.status).toBe(200)
    expect(deleteCompanyCascade).toHaveBeenCalledWith('c9')
  })
  it('403 si no es admin de plataforma', async () => {
    isAdminEmail.mockReturnValue(false)
    expect((await DELETE(req, ctx('c9'))).status).toBe(403)
    expect(deleteCompanyCascade).not.toHaveBeenCalled()
  })
  it('401 sin sesión', async () => {
    getCurrentUser.mockResolvedValue(null)
    expect((await DELETE(req, ctx('c9'))).status).toBe(401)
  })
})
