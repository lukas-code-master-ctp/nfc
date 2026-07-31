import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockVerify, mockCookieGet } = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockCookieGet: vi.fn(),
}))
vi.mock('@/lib/firebase/admin', () => ({ verifySessionCookie: mockVerify }))
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

  it('verifica la cookie de SESIÓN, no un ID token', async () => {
    mockCookieGet.mockReturnValue({ value: 'cookie' })
    mockVerify.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', auth_time: 1000 })
    await getCurrentUser()
    expect(mockVerify).toHaveBeenCalledWith('cookie')
  })

  it('expone uid, email y authTime', async () => {
    mockCookieGet.mockReturnValue({ value: 'cookie' })
    mockVerify.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', auth_time: 1755000000 })
    expect(await getCurrentUser()).toEqual({ uid: 'u1', email: 'a@b.cl', authTime: 1755000000 })
  })

  it('null si la cookie es inválida o venció', async () => {
    mockCookieGet.mockReturnValue({ value: 'bad' })
    mockVerify.mockRejectedValue(new Error('invalid'))
    expect(await getCurrentUser()).toBeNull()
  })
})
