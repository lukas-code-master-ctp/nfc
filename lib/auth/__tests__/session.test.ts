import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockVerify, mockCookieGet } = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockCookieGet: vi.fn(),
}))
vi.mock('@/lib/firebase/admin', () => ({ verifyIdToken: mockVerify }))
vi.mock('next/headers', () => ({ cookies: () => ({ get: mockCookieGet }) }))

import { getCurrentUser } from '@/lib/auth/session'

beforeEach(() => {
  mockVerify.mockReset()
  mockCookieGet.mockReset()
})

describe('getCurrentUser', () => {
  it('null sin cookie', async () => {
    mockCookieGet.mockReturnValue(undefined)
    expect(await getCurrentUser()).toBeNull()
  })
  it('devuelve uid/email con token válido', async () => {
    mockCookieGet.mockReturnValue({ value: 'tok' })
    mockVerify.mockResolvedValue({ uid: 'u1', email: 'a@b.cl' })
    expect(await getCurrentUser()).toEqual({ uid: 'u1', email: 'a@b.cl' })
  })
  it('null si el token es inválido', async () => {
    mockCookieGet.mockReturnValue({ value: 'bad' })
    mockVerify.mockRejectedValue(new Error('invalid'))
    expect(await getCurrentUser()).toBeNull()
  })
})
