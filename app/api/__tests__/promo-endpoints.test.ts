import { describe, it, expect, beforeEach } from 'vitest'
import { vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  can: vi.fn(() => true),
  getCompany: vi.fn(),
  getPromoCode: vi.fn(),
  canjearPromo: vi.fn(),
}))

vi.mock('@/lib/auth/membership', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/auth/roles', () => ({ can: mocks.can }))
vi.mock('@/lib/data/companies', () => ({ getCompany: mocks.getCompany }))
vi.mock('@/lib/data/promoCodes', () => ({
  getPromoCode: mocks.getPromoCode,
  canjearPromo: mocks.canjearPromo,
}))

// `normalizarCodigo`/`puedeCanjear` (lib/promo/canje) y `hoyEnChile`
// (lib/documents/status) son puros, sin Firebase: se usan reales, sin mockear.

const { POST: validar } = await import('@/app/api/promo/validar/route')
const { POST: canjear } = await import('@/app/api/promo/canjear/route')

function req(body: unknown): NextRequest {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest
}

const CODE_SANO = {
  codigo: 'TAPCAR2026',
  descripcion: 'Promo test',
  mesesGratis: 3,
  vehiculosIncluidos: 10,
  activo: true,
  expiraEn: null,
  maxCanjes: null,
  canjes: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  createdByUid: 'admin1',
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.can.mockReturnValue(true)
  mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
  mocks.getCompany.mockResolvedValue({
    id: 'c1',
    ownerUid: 'u1',
    company: { razonSocial: 'Empresa Test' },
    plan: { maxVehiculos: 3 },
  })
  mocks.getPromoCode.mockResolvedValue(CODE_SANO)
  mocks.canjearPromo.mockResolvedValue({ ok: true, promo: { codigo: 'TAPCAR2026', mesesGratis: 3, vehiculosIncluidos: 10, canjeadoEn: '2026-08-01T00:00:00.000Z', hasta: '2026-11-01' } })
})

describe('POST /api/promo/validar', () => {
  it('1. sin sesión -> 401, sin consultar el código', async () => {
    mocks.getMembership.mockResolvedValue(null)
    const res = await validar(req({ codigo: 'TAPCAR2026' }))
    expect(res.status).toBe(401)
    expect(mocks.getPromoCode).not.toHaveBeenCalled()
  })

  it('2a. rol viewer -> 403', async () => {
    mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'viewer' })
    mocks.can.mockReturnValue(false)
    const res = await validar(req({ codigo: 'TAPCAR2026' }))
    expect(res.status).toBe(403)
  })

  it('2b. rol editor -> 403', async () => {
    mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'editor' })
    mocks.can.mockReturnValue(false)
    const res = await validar(req({ codigo: 'TAPCAR2026' }))
    expect(res.status).toBe(403)
  })

  it('3. código inexistente -> 200 { valido: false, motivo: "no_existe" }', async () => {
    mocks.getPromoCode.mockResolvedValue(null)
    const res = await validar(req({ codigo: 'NOEXISTE' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ valido: false, motivo: 'no_existe' })
  })

  it('4. código sano -> 200 { valido: true, mesesGratis, vehiculosIncluidos }', async () => {
    const res = await validar(req({ codigo: 'TAPCAR2026' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ valido: true, mesesGratis: 3, vehiculosIncluidos: 10 })
  })

  it('5. empresa que ya canjeó -> { valido: false, motivo: "ya_canjeado" }', async () => {
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: { razonSocial: 'Empresa Test' },
      plan: { maxVehiculos: 3, promo: { codigo: 'OTRO', mesesGratis: 1, vehiculosIncluidos: 5, canjeadoEn: '2026-01-01T00:00:00.000Z', hasta: '2026-02-01' } },
    })
    const res = await validar(req({ codigo: 'TAPCAR2026' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ valido: false, motivo: 'ya_canjeado' })
  })

  it('6. no incrementa el contador de canjes en ningún caso (canjearPromo nunca se llama)', async () => {
    // Camino feliz.
    await validar(req({ codigo: 'TAPCAR2026' }))
    expect(mocks.canjearPromo).not.toHaveBeenCalled()

    // Código inexistente.
    mocks.getPromoCode.mockResolvedValue(null)
    await validar(req({ codigo: 'NOEXISTE' }))
    expect(mocks.canjearPromo).not.toHaveBeenCalled()

    // Empresa que ya canjeó.
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: { razonSocial: 'Empresa Test' },
      plan: { maxVehiculos: 3, promo: { codigo: 'OTRO', mesesGratis: 1, vehiculosIncluidos: 5, canjeadoEn: '2026-01-01T00:00:00.000Z', hasta: '2026-02-01' } },
    })
    await validar(req({ codigo: 'TAPCAR2026' }))
    expect(mocks.canjearPromo).not.toHaveBeenCalled()

    // Sin sesión y sin permiso también quedan cubiertos: no llegan a tocar nada.
    mocks.getMembership.mockResolvedValue(null)
    await validar(req({ codigo: 'TAPCAR2026' }))
    expect(mocks.canjearPromo).not.toHaveBeenCalled()
  })

  it('7. código con basura ("  ¡!  ") -> { valido: false, motivo: "no_existe" } sin ir a Firestore', async () => {
    const res = await validar(req({ codigo: '  ¡!  ' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ valido: false, motivo: 'no_existe' })
    expect(mocks.getPromoCode).not.toHaveBeenCalled()
  })
})

describe('POST /api/promo/canjear', () => {
  it('8a. sin sesión -> 401', async () => {
    mocks.getMembership.mockResolvedValue(null)
    const res = await canjear(req({ codigo: 'TAPCAR2026' }))
    expect(res.status).toBe(401)
    expect(mocks.canjearPromo).not.toHaveBeenCalled()
  })

  it('8b. rol viewer -> 403', async () => {
    mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'viewer' })
    mocks.can.mockReturnValue(false)
    const res = await canjear(req({ codigo: 'TAPCAR2026' }))
    expect(res.status).toBe(403)
    expect(mocks.canjearPromo).not.toHaveBeenCalled()
  })

  it('8c. rol editor -> 403', async () => {
    mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'editor' })
    mocks.can.mockReturnValue(false)
    const res = await canjear(req({ codigo: 'TAPCAR2026' }))
    expect(res.status).toBe(403)
    expect(mocks.canjearPromo).not.toHaveBeenCalled()
  })

  it('9. camino feliz -> 200 { ok: true, promo }, con canjearPromo llamado con el código normalizado', async () => {
    const res = await canjear(req({ codigo: '  tapcar2026  ' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      promo: { codigo: 'TAPCAR2026', mesesGratis: 3, vehiculosIncluidos: 10, canjeadoEn: '2026-08-01T00:00:00.000Z', hasta: '2026-11-01' },
    })
    expect(mocks.canjearPromo).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'c1', codigo: 'TAPCAR2026' }),
    )
  })

  it('10. motivo de rechazo -> 409 { error: <motivo> }', async () => {
    mocks.canjearPromo.mockResolvedValue({ ok: false, motivo: 'agotado' })
    const res = await canjear(req({ codigo: 'TAPCAR2026' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'agotado' })
  })

  it('11. cuerpo sin `codigo` -> 400', async () => {
    const res = await canjear(req({}))
    expect(res.status).toBe(400)
    expect(mocks.canjearPromo).not.toHaveBeenCalled()
  })
})
