import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.fn()
vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))
vi.mock('@/lib/data/companies', () => ({ getCompany: () => Promise.resolve({ ownerUid: 'owner' }) }))

const changeMemberRole = vi.fn()
const removeMember = vi.fn()
vi.mock('@/lib/data/members', () => ({
  changeMemberRole: (...a: unknown[]) => changeMemberRole(...a),
  removeMember: (...a: unknown[]) => removeMember(...a),
}))

import { PATCH, DELETE } from '@/app/api/company/members/[uid]/route'

const admin = { uid: 'u1', email: 'j@b.cl', companyId: 'c1', role: 'admin' }
function req(body: unknown) {
  return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest
}
function ctx(uid: string) {
  return { params: Promise.resolve({ uid }) }
}

beforeEach(() => {
  getMembership.mockReset(); changeMemberRole.mockReset(); removeMember.mockReset()
  getMembership.mockResolvedValue(admin)
})

describe('PATCH members', () => {
  it('403 al dueño', async () => {
    const res = await PATCH(req({ role: 'editor' }), ctx('owner'))
    expect(res.status).toBe(403)
    expect(changeMemberRole).not.toHaveBeenCalled()
  })
  it('403 a uno mismo', async () => {
    const res = await PATCH(req({ role: 'editor' }), ctx('u1'))
    expect(res.status).toBe(403)
  })
  it('400 rol inválido', async () => {
    const res = await PATCH(req({ role: 'jefe' }), ctx('u2'))
    expect(res.status).toBe(400)
  })
  it('200 cambia rol de otro miembro', async () => {
    const res = await PATCH(req({ role: 'viewer' }), ctx('u2'))
    expect(res.status).toBe(200)
    expect(changeMemberRole).toHaveBeenCalledWith('c1', 'u2', 'viewer')
  })
})

describe('DELETE members', () => {
  it('403 al dueño', async () => {
    const res = await DELETE(req({}), ctx('owner'))
    expect(res.status).toBe(403)
    expect(removeMember).not.toHaveBeenCalled()
  })
  it('200 quita a otro miembro', async () => {
    const res = await DELETE(req({}), ctx('u2'))
    expect(res.status).toBe(200)
    expect(removeMember).toHaveBeenCalledWith('c1', 'u2')
  })
})
