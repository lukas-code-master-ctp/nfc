import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from '@/lib/auth/constants'

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  createSessionCookie: vi.fn(),
  ensureProvisioned: vi.fn(),
  sendBienvenidaEmail: vi.fn(),
}))

vi.mock('@/lib/firebase/admin', () => ({
  verifyIdToken: mocks.verifyIdToken,
  createSessionCookie: mocks.createSessionCookie,
}))
vi.mock('@/lib/data/companies', () => ({ ensureProvisioned: mocks.ensureProvisioned }))
vi.mock('@/lib/email/resend', () => ({ sendBienvenidaEmail: mocks.sendBienvenidaEmail }))

const { POST } = await import('@/app/api/session/renovar/route')

const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as unknown as NextRequest

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.verifyIdToken.mockResolvedValue({ uid: 'u1', email: 'ana@flota.cl' })
  mocks.createSessionCookie.mockResolvedValue('cookie-nueva')
})

describe('renovar', () => {
  it('acuña una cookie nueva con la misma duración que el login', async () => {
    const res = await POST(req({ idToken: 'tok' }))
    expect(mocks.createSessionCookie).toHaveBeenCalledWith('tok', SESSION_MAX_AGE_MS)
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBe('cookie-nueva')
    expect(res.cookies.get(SESSION_COOKIE)?.maxAge).toBe(14 * 24 * 60 * 60)
  })

  it('rechaza un token inválido sin acuñar nada', async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error('bad'))
    const res = await POST(req({ idToken: 'malo' }))
    expect(res.status).toBe(401)
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined()
  })
})

describe('lo que NO debe hacer', () => {
  // Regresión de costo: este endpoint corre en CADA apertura de la app.
  // `ensureProvisioned` lee Firestore; meterlo acá sería una lectura por
  // apertura, para siempre. Login provisiona; renovación no.
  it('no provisiona: eso costaría una lectura de Firestore por apertura', async () => {
    await POST(req({ idToken: 'tok' }))
    expect(mocks.ensureProvisioned).not.toHaveBeenCalled()
  })

  it('no manda correos', async () => {
    await POST(req({ idToken: 'tok' }))
    expect(mocks.sendBienvenidaEmail).not.toHaveBeenCalled()
  })
})
