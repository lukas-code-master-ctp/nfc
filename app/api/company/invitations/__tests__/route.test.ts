import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.fn()
vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))

const getUserByEmail = vi.fn()
const userDocGet = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { getUserByEmail: (...a: unknown[]) => getUserByEmail(...a) },
  adminDb: { collection: () => ({ doc: () => ({ get: userDocGet }) }) },
}))

const countMembers = vi.fn()
vi.mock('@/lib/data/members', () => ({ countMembers: () => countMembers() }))

const hasPending = vi.fn()
const countPending = vi.fn()
const createInvitation = vi.fn()
vi.mock('@/lib/data/invitations', () => ({
  hasPendingInvitation: (...a: unknown[]) => hasPending(...a),
  countPendingInvitations: () => countPending(),
  createInvitation: (...a: unknown[]) => createInvitation(...a),
  normalizeEmail: (e: string) => e.trim().toLowerCase(),
}))

vi.mock('@/lib/data/companies', () => ({ getCompany: () => Promise.resolve({ company: { razonSocial: 'X' } }) }))
const sendInvitationEmail = vi.fn()
vi.mock('@/lib/email/resend', () => ({ sendInvitationEmail: (...a: unknown[]) => sendInvitationEmail(...a) }))

import { POST } from '@/app/api/company/invitations/route'

function reqBody(body: unknown) {
  return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest
}

beforeEach(() => {
  getMembership.mockReset(); getUserByEmail.mockReset(); userDocGet.mockReset()
  countMembers.mockReset(); hasPending.mockReset(); countPending.mockReset()
  createInvitation.mockReset(); sendInvitationEmail.mockReset()
  getUserByEmail.mockRejectedValue(new Error('not found')) // correo libre por defecto
  hasPending.mockResolvedValue(false)
  countMembers.mockResolvedValue(1); countPending.mockResolvedValue(0)
  createInvitation.mockResolvedValue({ id: 'i1', token: 'tok' })
})

const admin = { uid: 'u1', email: 'jefe@b.cl', companyId: 'c1', role: 'admin' }

describe('POST /api/company/invitations', () => {
  it('403 si no es admin', async () => {
    getMembership.mockResolvedValue({ ...admin, role: 'editor' })
    const res = await POST(reqBody({ email: 'a@b.cl', role: 'viewer' }))
    expect(res.status).toBe(403)
  })

  it('400 con correo inválido', async () => {
    getMembership.mockResolvedValue(admin)
    const res = await POST(reqBody({ email: 'no-es-correo', role: 'viewer' }))
    expect(res.status).toBe(400)
  })

  it('422 si el correo ya tiene cuenta con empresa', async () => {
    getMembership.mockResolvedValue(admin)
    getUserByEmail.mockResolvedValue({ uid: 'uX' })
    userDocGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'cOtra' }) })
    const res = await POST(reqBody({ email: 'ya@b.cl', role: 'viewer' }))
    expect(res.status).toBe(422)
  })

  it('409 si no hay cupo', async () => {
    getMembership.mockResolvedValue(admin)
    countMembers.mockResolvedValue(4); countPending.mockResolvedValue(1)
    const res = await POST(reqBody({ email: 'a@b.cl', role: 'viewer' }))
    expect(res.status).toBe(409)
  })

  it('200 crea la invitación y devuelve acceptUrl', async () => {
    getMembership.mockResolvedValue(admin)
    const res = await POST(reqBody({ email: 'A@B.cl', role: 'editor' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.acceptUrl).toContain('invite=tok')
    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'c1', email: 'a@b.cl', role: 'editor', invitedByUid: 'u1' }),
    )
  })
})
