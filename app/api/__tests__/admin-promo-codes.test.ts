import { describe, it, expect, beforeEach } from 'vitest'
import { vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  isAdminEmail: vi.fn(),
  createPromoCode: vi.fn(),
  setPromoCodeActivo: vi.fn(),
}))

vi.mock('@/lib/auth/membership', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/auth/admin', () => ({ isAdminEmail: mocks.isAdminEmail }))
vi.mock('@/lib/data/promoCodes', () => ({
  createPromoCode: mocks.createPromoCode,
  setPromoCodeActivo: mocks.setPromoCodeActivo,
}))

// `normalizarCodigo` (lib/promo/canje) es puro, sin Firebase: se usa real, sin mockear.

const { POST } = await import('@/app/api/admin/promo-codes/route')
const { PATCH } = await import('@/app/api/admin/promo-codes/[id]/route')

function req(body: unknown): NextRequest {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

const BODY_SANO = {
  codigo: 'tapcar-agosto',
  descripcion: 'Campaña agosto',
  mesesGratis: 3,
  vehiculosIncluidos: 10,
  expiraEn: '2026-12-31',
  maxCanjes: 50,
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.getMembership.mockResolvedValue({ uid: 'admin1', email: 'admin@tapcar.cl', companyId: 'c-admin', role: 'admin' })
  mocks.isAdminEmail.mockReturnValue(true)
  mocks.createPromoCode.mockResolvedValue(undefined)
  mocks.setPromoCodeActivo.mockResolvedValue(undefined)
})

describe('POST /api/admin/promo-codes', () => {
  it('1a. sin sesión -> 401', async () => {
    mocks.getMembership.mockResolvedValue(null)
    const res = await POST(req(BODY_SANO))
    expect(res.status).toBe(401)
    expect(mocks.createPromoCode).not.toHaveBeenCalled()
  })

  it('1b. con sesión pero email fuera de ADMIN_EMAILS -> 403 (admin de empresa no puede crear códigos)', async () => {
    mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'admin@empresacliente.cl', companyId: 'c1', role: 'admin' })
    mocks.isAdminEmail.mockReturnValue(false)
    const res = await POST(req(BODY_SANO))
    expect(res.status).toBe(403)
    expect(mocks.createPromoCode).not.toHaveBeenCalled()
  })

  it('2. código que queda vacío tras normalizar -> 400', async () => {
    const res = await POST(req({ ...BODY_SANO, codigo: '  ¡!  ' }))
    expect(res.status).toBe(400)
    expect(mocks.createPromoCode).not.toHaveBeenCalled()
  })

  it('3. mesesGratis 0 Y vehiculosIncluidos 0 -> 400 (no otorga nada)', async () => {
    const res = await POST(req({ ...BODY_SANO, mesesGratis: 0, vehiculosIncluidos: 0 }))
    expect(res.status).toBe(400)
    expect(mocks.createPromoCode).not.toHaveBeenCalled()
  })

  it('4a. mesesGratis 25 -> 400', async () => {
    const res = await POST(req({ ...BODY_SANO, mesesGratis: 25 }))
    expect(res.status).toBe(400)
    expect(mocks.createPromoCode).not.toHaveBeenCalled()
  })

  it('4b. vehiculosIncluidos 101 -> 400', async () => {
    const res = await POST(req({ ...BODY_SANO, vehiculosIncluidos: 101 }))
    expect(res.status).toBe(400)
    expect(mocks.createPromoCode).not.toHaveBeenCalled()
  })

  it('5. camino feliz -> createPromoCode llamado con el código NORMALIZADO', async () => {
    const res = await POST(req(BODY_SANO))
    expect(res.status).toBe(200)
    expect(mocks.createPromoCode).toHaveBeenCalledWith(
      expect.objectContaining({ codigo: 'TAPCAR-AGOSTO' }),
      'admin1',
    )
  })
})

describe('PATCH /api/admin/promo-codes/[id]', () => {
  it('6. sin ser admin de plataforma -> 403', async () => {
    mocks.isAdminEmail.mockReturnValue(false)
    const res = await PATCH(req({ activo: false }), ctx('TAPCARAGOSTO'))
    expect(res.status).toBe(403)
    expect(mocks.setPromoCodeActivo).not.toHaveBeenCalled()
  })

  it('7. camino feliz -> setPromoCodeActivo llamado con el id y el booleano', async () => {
    const res = await PATCH(req({ activo: false }), ctx('TAPCARAGOSTO'))
    expect(res.status).toBe(200)
    expect(mocks.setPromoCodeActivo).toHaveBeenCalledWith('TAPCARAGOSTO', false)
  })
})
