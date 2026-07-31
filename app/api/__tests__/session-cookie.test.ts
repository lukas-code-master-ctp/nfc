import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from '@/lib/auth/constants'

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  createSessionCookie: vi.fn(),
  ensureProvisioned: vi.fn(),
  sendBienvenidaEmail: vi.fn(),
  after: vi.fn((cb: () => unknown) => { void cb() }),
}))

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  after: mocks.after,
}))
vi.mock('@/lib/firebase/admin', () => ({
  verifyIdToken: mocks.verifyIdToken,
  createSessionCookie: mocks.createSessionCookie,
}))
vi.mock('@/lib/data/companies', () => ({ ensureProvisioned: mocks.ensureProvisioned }))
vi.mock('@/lib/email/resend', () => ({ sendBienvenidaEmail: mocks.sendBienvenidaEmail }))

const { POST } = await import('@/app/api/session/route')

const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as unknown as NextRequest

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.after.mockImplementation((cb: () => unknown) => { void cb() })
  mocks.verifyIdToken.mockResolvedValue({ uid: 'u1', email: 'ana@flota.cl' })
  mocks.ensureProvisioned.mockResolvedValue('ya_estaba')
  mocks.createSessionCookie.mockResolvedValue('cookie-de-sesion')
})

describe('qué guarda la cookie', () => {
  it('la session cookie de Firebase, no el ID token', async () => {
    const res = await POST(req({ idToken: 'tok' }))
    expect(mocks.createSessionCookie).toHaveBeenCalledWith('tok', SESSION_MAX_AGE_MS)
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBe('cookie-de-sesion')
  })
})

describe('cuánto dura', () => {
  it('14 días, y el maxAge de la cookie va en segundos', async () => {
    const res = await POST(req({ idToken: 'tok' }))
    expect(res.cookies.get(SESSION_COOKIE)?.maxAge).toBe(14 * 24 * 60 * 60)
  })

  it('SESSION_MAX_AGE_MS está en milisegundos, como lo pide Firebase', () => {
    expect(SESSION_MAX_AGE_MS).toBe(14 * 24 * 60 * 60 * 1000)
  })
})

describe('sigue igual de protegida', () => {
  it('httpOnly y sameSite lax', async () => {
    const res = await POST(req({ idToken: 'tok' }))
    const c = res.cookies.get(SESSION_COOKIE)!
    expect(c.httpOnly).toBe(true)
    expect(c.sameSite).toBe('lax')
  })
})

describe('cuando no se puede acuñar', () => {
  it('responde 500 y NO deja una cookie a medias', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.createSessionCookie.mockRejectedValue(new Error('token vencido'))
    const res = await POST(req({ idToken: 'tok' }))
    expect(res.status).toBe(500)
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined()
    err.mockRestore()
  })

  it('el token inválido sigue dando 401 antes de acuñar nada', async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error('bad token'))
    const res = await POST(req({ idToken: 'malo' }))
    expect(res.status).toBe(401)
    expect(mocks.createSessionCookie).not.toHaveBeenCalled()
  })
})
