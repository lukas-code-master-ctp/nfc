import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  can: vi.fn(() => true),
  saveOnboarding: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/auth/membership', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/auth/roles', () => ({ can: mocks.can }))
vi.mock('@/lib/data/companies', () => ({ saveOnboarding: mocks.saveOnboarding }))

const { PATCH } = await import('@/app/api/onboarding/route')

function req(body: unknown): NextRequest {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.can.mockReturnValue(true)
  mocks.saveOnboarding.mockResolvedValue(undefined)
  mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
})

describe('permisos', () => {
  it('401 sin sesión', async () => {
    mocks.getMembership.mockResolvedValue(null)
    const res = await PATCH(req({ tipoCuenta: 'personal' }))
    expect(res.status).toBe(401)
    expect(mocks.saveOnboarding).not.toHaveBeenCalled()
  })

  it('403 a quien no puede configurar la empresa (Editor o Visor)', async () => {
    mocks.can.mockReturnValue(false)
    const res = await PATCH(req({ tipoCuenta: 'personal' }))
    expect(res.status).toBe(403)
    expect(mocks.saveOnboarding).not.toHaveBeenCalled()
  })

  it('usa el companyId de la sesión y nunca el del cliente', async () => {
    await PATCH(req({ tipoCuenta: 'empresa', companyId: 'otra-empresa' }))
    expect(mocks.saveOnboarding).toHaveBeenCalledWith('c1', { tipoCuenta: 'empresa' })
  })
})

describe('tipoCuenta', () => {
  it('acepta personal y empresa', async () => {
    expect((await PATCH(req({ tipoCuenta: 'personal' }))).status).toBe(200)
    expect((await PATCH(req({ tipoCuenta: 'empresa' }))).status).toBe(200)
  })

  it('400 con un valor desconocido', async () => {
    const res = await PATCH(req({ tipoCuenta: 'freelance' }))
    expect(res.status).toBe(400)
    expect(mocks.saveOnboarding).not.toHaveBeenCalled()
  })
})

describe('visto', () => {
  it('acepta los pasos informativos', async () => {
    await PATCH(req({ visto: 'chip' }))
    expect(mocks.saveOnboarding).toHaveBeenCalledWith('c1', { agregarVisto: 'chip' })
  })

  it('400 con un paso que no es informativo, para no inflar el arreglo con basura', async () => {
    const res = await PATCH(req({ visto: 'vehiculo' }))
    expect(res.status).toBe(400)
    expect(mocks.saveOnboarding).not.toHaveBeenCalled()
  })

  it('400 con un paso inventado', async () => {
    expect((await PATCH(req({ visto: 'lo-que-sea' }))).status).toBe(400)
  })
})

describe('descartado', () => {
  it('true estampa una fecha', async () => {
    await PATCH(req({ descartado: true }))
    const patch = mocks.saveOnboarding.mock.calls[0][1] as { descartadoEn: string | null }
    expect(typeof patch.descartadoEn).toBe('string')
  })

  it('false lo limpia, para volver a mostrar la tarjeta', async () => {
    await PATCH(req({ descartado: false }))
    expect(mocks.saveOnboarding).toHaveBeenCalledWith('c1', { descartadoEn: null })
  })

  it('400 si no es booleano', async () => {
    expect((await PATCH(req({ descartado: 'si' }))).status).toBe(400)
  })
})

describe('patch vacío', () => {
  it('400 si no viene ningún campo válido', async () => {
    const res = await PATCH(req({}))
    expect(res.status).toBe(400)
    expect(mocks.saveOnboarding).not.toHaveBeenCalled()
  })
})
