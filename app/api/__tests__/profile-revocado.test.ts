import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  saveProfile: vi.fn(),
  getProfile: vi.fn(),
  getCurrentUser: vi.fn(),
}))

vi.mock('@/lib/auth/membership', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }))
vi.mock('@/lib/data/profile', () => ({ saveProfile: mocks.saveProfile, getProfile: mocks.getProfile }))

const { PATCH } = await import('@/app/api/profile/route')

const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as unknown as NextRequest

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.saveProfile.mockResolvedValue(undefined)
})

describe('PATCH /api/profile', () => {
  it('con membresía vigente guarda el nombre', async () => {
    mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'ana@flota.cl', companyId: 'c1', role: 'admin' })
    const res = await PATCH(req({ displayName: '  Ana  ' }))
    expect(res.status).toBe(200)
    expect(mocks.saveProfile).toHaveBeenCalledWith('u1', 'ana@flota.cl', { displayName: 'Ana' })
  })

  // `getMembership()` devuelve null cuando la sesión está revocada. Es el único
  // MUTADOR que quedaría fuera del alcance de la revocación si usara
  // `getCurrentUser()`, que no comprueba nada.
  it('una sesión revocada no puede cambiar el nombre', async () => {
    mocks.getMembership.mockResolvedValue(null)
    const res = await PATCH(req({ displayName: 'Intruso' }))
    expect(res.status).toBe(401)
    expect(mocks.saveProfile).not.toHaveBeenCalled()
  })
})
