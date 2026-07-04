import { it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  userDoc: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }))
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ get: mocks.userDoc }) }) },
}))

import { getMembership } from '@/lib/auth/membership'

beforeEach(() => {
  mocks.getCurrentUser.mockReset()
  mocks.userDoc.mockReset()
})

it('devuelve null sin sesión', async () => {
  mocks.getCurrentUser.mockResolvedValue(null)
  expect(await getMembership()).toBeNull()
})

it('devuelve null si el user no tiene companyId', async () => {
  mocks.getCurrentUser.mockResolvedValue({ uid: 'u1', email: 'a@x.cl' })
  mocks.userDoc.mockResolvedValue({ exists: true, data: () => ({ role: 'admin' }) })
  expect(await getMembership()).toBeNull()
})

it('resuelve membership completo', async () => {
  mocks.getCurrentUser.mockResolvedValue({ uid: 'u1', email: 'a@x.cl' })
  mocks.userDoc.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1', role: 'editor' }) })
  expect(await getMembership()).toEqual({ uid: 'u1', email: 'a@x.cl', companyId: 'c1', role: 'editor' })
})
