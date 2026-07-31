import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  get: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }))
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ get: mocks.get }) }) },
}))

import { getMembership } from '@/lib/auth/membership'

/** 2026-07-31T12:00:00Z en segundos. */
const SEG = Math.floor(Date.parse('2026-07-31T12:00:00.000Z') / 1000)

const docCon = (data: Record<string, unknown>) => ({ exists: true, data: () => data })
const MIEMBRO = { companyId: 'c1', role: 'admin' }

beforeEach(() => {
  mocks.getCurrentUser.mockReset()
  mocks.get.mockReset()
  mocks.getCurrentUser.mockResolvedValue({ uid: 'u1', email: 'ana@flota.cl', authTime: SEG })
})

describe('camino normal', () => {
  it('devuelve la membresía', async () => {
    mocks.get.mockResolvedValue(docCon(MIEMBRO))
    expect(await getMembership()).toEqual({
      uid: 'u1', email: 'ana@flota.cl', companyId: 'c1', role: 'admin',
    })
  })

  it('null sin sesión', async () => {
    mocks.getCurrentUser.mockResolvedValue(null)
    expect(await getMembership()).toBeNull()
  })

  it('null si el perfil no existe', async () => {
    mocks.get.mockResolvedValue({ exists: false })
    expect(await getMembership()).toBeNull()
  })

  // Guard de autorización: un perfil a medias (sin companyId o sin role) no otorga acceso.
  // Estos dos tests verifican que ese guard no se rompa.
  it('null sin companyId (guard de autorización)', async () => {
    mocks.get.mockResolvedValue(docCon({ role: 'admin' }))
    expect(await getMembership()).toBeNull()
  })

  it('null sin role (guard de autorización)', async () => {
    mocks.get.mockResolvedValue(docCon({ companyId: 'c1' }))
    expect(await getMembership()).toBeNull()
  })
})

describe('sesión revocada', () => {
  it('no da membresía, aunque el perfil esté completo', async () => {
    mocks.get.mockResolvedValue(docCon({ ...MIEMBRO, sesionesValidasDesde: '2026-07-31T13:00:00.000Z' }))
    expect(await getMembership()).toBeNull()
  })

  it('una sesión iniciada DESPUÉS del corte sí pasa', async () => {
    mocks.get.mockResolvedValue(docCon({ ...MIEMBRO, sesionesValidasDesde: '2026-07-31T11:00:00.000Z' }))
    expect(await getMembership()).not.toBeNull()
  })
})

describe('costo', () => {
  it('lee el perfil UNA sola vez: la revocación no agrega consultas', async () => {
    mocks.get.mockResolvedValue(docCon(MIEMBRO))
    await getMembership()
    expect(mocks.get).toHaveBeenCalledTimes(1)
  })
})
