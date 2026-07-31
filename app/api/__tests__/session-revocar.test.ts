import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SESSION_COOKIE } from '@/lib/auth/constants'

const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  revokeRefreshTokens: vi.fn(),
  revocarSesiones: vi.fn(),
}))

vi.mock('@/lib/auth/membership', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/firebase/admin', () => ({ revokeRefreshTokens: mocks.revokeRefreshTokens }))
vi.mock('@/lib/data/profile', () => ({ revocarSesiones: mocks.revocarSesiones }))

const { POST } = await import('@/app/api/session/revocar/route')

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'ana@flota.cl', companyId: 'c1', role: 'admin' })
  mocks.revokeRefreshTokens.mockResolvedValue(undefined)
  mocks.revocarSesiones.mockResolvedValue(undefined)
})

describe('revocar', () => {
  it('mata los refresh tokens para que el dispositivo perdido se auto-expulse', async () => {
    await POST()
    expect(mocks.revokeRefreshTokens).toHaveBeenCalledWith('u1')
  })

  it('estampa el corte truncado al segundo', async () => {
    await POST()
    const corte = mocks.revocarSesiones.mock.calls[0][1] as string
    expect(corte).toMatch(/\.000Z$/)
    expect(Number.isNaN(Date.parse(corte))).toBe(false)
  })

  it('borra la cookie de quien apretó el botón: revocar te incluye a ti', async () => {
    const res = await POST()
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBe('')
  })
})

describe('sin sesión', () => {
  it('responde 401 y no revoca nada', async () => {
    mocks.getMembership.mockResolvedValue(null)
    const res = await POST()
    expect(res.status).toBe(401)
    expect(mocks.revokeRefreshTokens).not.toHaveBeenCalled()
    expect(mocks.revocarSesiones).not.toHaveBeenCalled()
  })
})
