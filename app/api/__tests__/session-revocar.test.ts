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

// I3: sin el try/catch, un fallo a mitad de camino dejaba los refresh tokens
// revocados pero el corte de Firestore sin escribir, respondía 500 sin
// ningún rastro en los logs, y el usuario veía "no se pudo" cuando en
// realidad SÍ pasó algo (medio arreglo, silencioso). El orden (tokens
// primero) no cambia: sigue siendo el lado seguro si algo falla.
describe('cuando algo falla a mitad de camino', () => {
  it('revokeRefreshTokens lanza: responde 500 y loguea, sin llegar a Firestore', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.revokeRefreshTokens.mockRejectedValue(new Error('firebase caído'))
    const res = await POST()
    expect(res.status).toBe(500)
    expect(mocks.revocarSesiones).not.toHaveBeenCalled()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('revocarSesiones lanza tras revocar los tokens: responde 500 y loguea', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.revocarSesiones.mockRejectedValue(new Error('firestore caído'))
    const res = await POST()
    expect(res.status).toBe(500)
    expect(mocks.revokeRefreshTokens).toHaveBeenCalledWith('u1')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
