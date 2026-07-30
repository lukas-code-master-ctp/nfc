import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/constants'

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  ensureProvisioned: vi.fn(),
  sendBienvenidaEmail: vi.fn(),
  // `after` de next/server: se ejecuta el callback al toque para poder afirmar
  // sobre su efecto sin esperar al ciclo de vida real de la respuesta.
  after: vi.fn((cb: () => unknown) => { void cb() }),
}))

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  after: mocks.after,
}))
vi.mock('@/lib/firebase/admin', () => ({ verifyIdToken: mocks.verifyIdToken }))
vi.mock('@/lib/data/companies', () => ({ ensureProvisioned: mocks.ensureProvisioned }))
vi.mock('@/lib/email/resend', () => ({ sendBienvenidaEmail: mocks.sendBienvenidaEmail }))

const { POST } = await import('@/app/api/session/route')

const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as unknown as NextRequest

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.after.mockImplementation((cb: () => unknown) => { void cb() })
  mocks.sendBienvenidaEmail.mockResolvedValue(undefined)
  mocks.verifyIdToken.mockResolvedValue({ uid: 'u1', email: 'ana@flota.cl' })
})

describe('a quién le llega la bienvenida', () => {
  it('al crearse la cuenta, con su correo', async () => {
    mocks.ensureProvisioned.mockResolvedValue('creada')
    const res = await POST(req({ idToken: 'tok' }))
    expect(res.status).toBe(200)
    expect(mocks.sendBienvenidaEmail).toHaveBeenCalledWith('ana@flota.cl')
  })

  it('NO en los logins siguientes: la cuenta ya estaba', async () => {
    mocks.ensureProvisioned.mockResolvedValue('ya_estaba')
    await POST(req({ idToken: 'tok' }))
    expect(mocks.sendBienvenidaEmail).not.toHaveBeenCalled()
  })

  it('NO a quien entra por invitación: ya recibió el correo de invitación', async () => {
    mocks.ensureProvisioned.mockResolvedValue('invitado')
    await POST(req({ idToken: 'tok' }))
    expect(mocks.sendBienvenidaEmail).not.toHaveBeenCalled()
  })

  it('NO si el proveedor no entregó correo: no hay a dónde mandarlo', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'u1', email: undefined })
    mocks.ensureProvisioned.mockResolvedValue('creada')
    await POST(req({ idToken: 'tok' }))
    expect(mocks.sendBienvenidaEmail).not.toHaveBeenCalled()
  })

  it('NO si el token es inválido: no se provisiona nada', async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error('bad token'))
    const res = await POST(req({ idToken: 'malo' }))
    expect(res.status).toBe(401)
    expect(mocks.ensureProvisioned).not.toHaveBeenCalled()
    expect(mocks.sendBienvenidaEmail).not.toHaveBeenCalled()
  })
})

describe('no puede romper el login', () => {
  it('sale del ciclo de la respuesta, con after()', async () => {
    mocks.ensureProvisioned.mockResolvedValue('creada')
    await POST(req({ idToken: 'tok' }))
    expect(mocks.after).toHaveBeenCalledTimes(1)
  })

  it('si Resend falla, la sesión igual se crea y se entrega la cookie', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.ensureProvisioned.mockResolvedValue('creada')
    mocks.sendBienvenidaEmail.mockRejectedValue(new Error('resend caído'))
    const res = await POST(req({ idToken: 'tok' }))
    expect(res.status).toBe(200)
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBe('tok')
    err.mockRestore()
  })
})
