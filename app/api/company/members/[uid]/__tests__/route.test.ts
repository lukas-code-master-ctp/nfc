import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/membership', () => ({ getMembership: (...a: unknown[]) => getMembership(...a) }))
const getCompany = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/companies', () => ({ getCompany: (...a: unknown[]) => getCompany(...a) }))
const changeMemberRole = vi.hoisted(() => vi.fn())
const setMemberNotificaciones = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/members', () => ({
  changeMemberRole: (...a: unknown[]) => changeMemberRole(...a),
  removeMember: vi.fn(),
  setMemberNotificaciones: (...a: unknown[]) => setMemberNotificaciones(...a),
}))

import { PATCH } from '@/app/api/company/members/[uid]/route'

function req(body: unknown) { return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest }
function ctx(uid: string) { return { params: Promise.resolve({ uid }) } }

beforeEach(() => {
  getMembership.mockReset(); getCompany.mockReset(); changeMemberRole.mockReset(); setMemberNotificaciones.mockReset()
  getMembership.mockResolvedValue({ uid: 'me', email: 'me@x.cl', companyId: 'c1', role: 'admin' })
  getCompany.mockResolvedValue({ ownerUid: 'owner' })
})

describe('PATCH members/[uid]', () => {
  it('recibeAlertas: permite tocar al dueño', async () => {
    const res = await PATCH(req({ recibeAlertas: false }), ctx('owner'))
    expect(res.status).toBe(200)
    expect(setMemberNotificaciones).toHaveBeenCalledWith('c1', 'owner', false)
  })
  it('recibeAlertas: permite tocarse a uno mismo', async () => {
    const res = await PATCH(req({ recibeAlertas: true }), ctx('me'))
    expect(res.status).toBe(200)
    expect(setMemberNotificaciones).toHaveBeenCalledWith('c1', 'me', true)
  })
  it('role: sigue bloqueando al dueño', async () => {
    const res = await PATCH(req({ role: 'editor' }), ctx('owner'))
    expect(res.status).toBe(403)
    expect(changeMemberRole).not.toHaveBeenCalled()
  })
  it('403 si no es admin', async () => {
    getMembership.mockResolvedValue({ uid: 'me', email: 'me@x.cl', companyId: 'c1', role: 'editor' })
    const res = await PATCH(req({ recibeAlertas: true }), ctx('owner'))
    expect(res.status).toBe(403)
  })
})
