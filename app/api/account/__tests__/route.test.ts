import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/membership', () => ({ getMembership: (...a: unknown[]) => getMembership(...a) }))
const getCompany = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/companies', () => ({ getCompany: (...a: unknown[]) => getCompany(...a) }))
const deleteCompanyCascade = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/deleteCompany', () => ({ deleteCompanyCascade: (...a: unknown[]) => deleteCompanyCascade(...a) }))
const deleteProfile = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/profile', () => ({ deleteProfile: (...a: unknown[]) => deleteProfile(...a) }))
const deleteUser = vi.hoisted(() => vi.fn())
vi.mock('@/lib/firebase/admin', () => ({ adminAuth: { deleteUser: (...a: unknown[]) => deleteUser(...a) }, adminDb: {} }))

import { DELETE } from '@/app/api/account/route'

beforeEach(() => {
  getMembership.mockReset(); getCompany.mockReset()
  deleteCompanyCascade.mockReset(); deleteProfile.mockReset(); deleteUser.mockReset()
  getCompany.mockResolvedValue({ id: 'c1', ownerUid: 'owner' })
})

describe('DELETE /api/account', () => {
  it('dueño: borra la empresa completa (cascade)', async () => {
    getMembership.mockResolvedValue({ uid: 'owner', email: 'o@x.cl', companyId: 'c1', role: 'admin' })
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(deleteCompanyCascade).toHaveBeenCalledWith('c1')
    expect(deleteProfile).not.toHaveBeenCalled()
  })
  it('miembro no-dueño: borra SOLO su perfil y su Auth; la empresa queda', async () => {
    getMembership.mockResolvedValue({ uid: 'visor', email: 'v@x.cl', companyId: 'c1', role: 'viewer' })
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(deleteCompanyCascade).not.toHaveBeenCalled()
    expect(deleteProfile).toHaveBeenCalledWith('visor')
    expect(deleteUser).toHaveBeenCalledWith('visor')
  })
  it('401 sin sesión', async () => {
    getMembership.mockResolvedValue(null)
    expect((await DELETE()).status).toBe(401)
  })
})
