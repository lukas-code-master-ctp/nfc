import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockWhere = vi.fn(() => ({ get: mockGet, limit: () => ({ get: mockGet }) }))
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ where: mockWhere }) },
}))

import { findPendingInvitationByEmail, listPendingInvitations, normalizeEmail } from '@/lib/data/invitations'

const futuro = '2999-01-01T00:00:00.000Z'
const pasado = '2000-01-01T00:00:00.000Z'

beforeEach(() => {
  mockGet.mockReset()
  mockWhere.mockClear()
})

describe('normalizeEmail', () => {
  it('recorta y baja a minúsculas', () => {
    expect(normalizeEmail('  Foo@Bar.CL ')).toBe('foo@bar.cl')
  })
})

describe('findPendingInvitationByEmail', () => {
  it('ignora invitaciones expiradas', async () => {
    mockGet.mockResolvedValue({
      docs: [{ id: 'i1', data: () => ({ email: 'a@b.cl', status: 'pending', expiresAt: pasado, createdAt: pasado }) }],
    })
    expect(await findPendingInvitationByEmail('a@b.cl')).toBeNull()
  })
  it('devuelve la pendiente vigente', async () => {
    mockGet.mockResolvedValue({
      docs: [{ id: 'i2', data: () => ({ email: 'a@b.cl', status: 'pending', role: 'editor', companyId: 'c1', expiresAt: futuro, createdAt: futuro }) }],
    })
    const inv = await findPendingInvitationByEmail('a@b.cl')
    expect(inv?.id).toBe('i2')
    expect(inv?.companyId).toBe('c1')
  })
})

describe('listPendingInvitations', () => {
  it('filtra las que no están pending o están expiradas', async () => {
    mockGet.mockResolvedValue({
      docs: [
        { id: 'i1', data: () => ({ companyId: 'c1', status: 'pending', expiresAt: futuro, createdAt: futuro }) },
        { id: 'i2', data: () => ({ companyId: 'c1', status: 'revoked', expiresAt: futuro, createdAt: futuro }) },
        { id: 'i3', data: () => ({ companyId: 'c1', status: 'pending', expiresAt: pasado, createdAt: pasado }) },
      ],
    })
    const res = await listPendingInvitations('c1')
    expect(res.map((i) => i.id)).toEqual(['i1'])
  })
})
