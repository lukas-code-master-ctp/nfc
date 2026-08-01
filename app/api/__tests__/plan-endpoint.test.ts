import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  can: vi.fn(() => true),
  getCompany: vi.fn(),
  savePlan: vi.fn().mockResolvedValue(undefined),
  createBillingRequest: vi.fn().mockResolvedValue(undefined),
  sendBillingRequestEmail: vi.fn().mockResolvedValue(undefined),
  billingNotifyEmail: vi.fn(() => 'billing@tapcar.cl'),
  // `after` de next/server: se ejecuta el callback al toque para poder
  // afirmar sobre su efecto sin esperar al ciclo de vida real de la respuesta.
  after: vi.fn((cb: () => unknown) => { void cb() }),
}))

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  after: mocks.after,
}))
vi.mock('@/lib/auth/membership', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/auth/roles', () => ({ can: mocks.can }))
vi.mock('@/lib/data/companies', () => ({ getCompany: mocks.getCompany, savePlan: mocks.savePlan }))
vi.mock('@/lib/data/billing', () => ({ createBillingRequest: mocks.createBillingRequest }))
vi.mock('@/lib/email/resend', () => ({
  sendBillingRequestEmail: mocks.sendBillingRequestEmail,
  billingNotifyEmail: mocks.billingNotifyEmail,
}))

const { POST } = await import('@/app/api/plan/route')

function req(body: unknown): NextRequest {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.can.mockReturnValue(true)
  mocks.savePlan.mockResolvedValue(undefined)
  mocks.createBillingRequest.mockResolvedValue(undefined)
  mocks.sendBillingRequestEmail.mockResolvedValue(undefined)
  mocks.billingNotifyEmail.mockReturnValue('billing@tapcar.cl')
  mocks.after.mockImplementation((cb: () => unknown) => { void cb() })
  mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
  mocks.getCompany.mockResolvedValue({
    id: 'c1',
    ownerUid: 'u1',
    company: { razonSocial: 'Empresa Test' },
    plan: { maxVehiculos: 3 },
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('permisos', () => {
  it('401 sin sesión, y savePlan no se llamó', async () => {
    mocks.getMembership.mockResolvedValue(null)
    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 5 }))
    expect(res.status).toBe(401)
    expect(mocks.savePlan).not.toHaveBeenCalled()
  })

  it('403 a Visor', async () => {
    mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'viewer' })
    mocks.can.mockReturnValue(false)
    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 5 }))
    expect(res.status).toBe(403)
    expect(mocks.savePlan).not.toHaveBeenCalled()
  })

  it('403 a Editor', async () => {
    mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'editor' })
    mocks.can.mockReturnValue(false)
    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 5 }))
    expect(res.status).toBe(403)
    expect(mocks.savePlan).not.toHaveBeenCalled()
  })
})

describe('validación', () => {
  it('400 con periodicidad "semanal"', async () => {
    const res = await POST(req({ periodicidad: 'semanal', maxVehiculos: 5 }))
    expect(res.status).toBe(400)
    expect(mocks.savePlan).not.toHaveBeenCalled()
  })

  it('400 con maxVehiculos 0', async () => {
    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 0 }))
    expect(res.status).toBe(400)
    expect(mocks.savePlan).not.toHaveBeenCalled()
  })

  it('400 con maxVehiculos 31 (sobre el tope self-service)', async () => {
    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 31 }))
    expect(res.status).toBe(400)
    expect(mocks.savePlan).not.toHaveBeenCalled()
  })

  it('400 con maxVehiculos "tres"', async () => {
    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 'tres' }))
    expect(res.status).toBe(400)
    expect(mocks.savePlan).not.toHaveBeenCalled()
  })
})

describe('alta ya hecha', () => {
  it('409 si la empresa ya tiene periodicidad, y savePlan no se llamó', async () => {
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: { razonSocial: 'Empresa Test' },
      plan: { maxVehiculos: 3, periodicidad: 'mensual' },
    })
    const res = await POST(req({ periodicidad: 'anual', maxVehiculos: 8 }))
    expect(res.status).toBe(409)
    expect(mocks.savePlan).not.toHaveBeenCalled()
  })
})

describe('camino feliz', () => {
  it('guarda el plan con gratisHasta = hoy + 30 días y registra la solicitud', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T12:00:00Z'))

    const res = await POST(req({ periodicidad: 'anual', maxVehiculos: 8 }))

    expect(res.status).toBe(200)
    expect(mocks.savePlan).toHaveBeenCalledWith('c1', {
      periodicidad: 'anual',
      maxVehiculos: 8,
      gratisHasta: '2026-08-31',
    })
    // Verifica que createBillingRequest se llamó con los argumentos correctos, incluyendo desiredVehicles.
    expect(mocks.createBillingRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'u1',
        email: 'a@b.cl',
        companyId: 'c1',
        desiredVehicles: 8,
      })
    )
    // Verifica que sendBillingRequestEmail se llamó con el destinatario como primer argumento y desiredVehicles correcto.
    expect(mocks.sendBillingRequestEmail).toHaveBeenCalledWith(
      'billing@tapcar.cl',
      expect.objectContaining({
        desiredVehicles: 8,
      })
    )
  })
})

describe('correo best-effort', () => {
  it('si el correo lanza, la respuesta sigue siendo 200 y el plan quedó guardado', async () => {
    mocks.sendBillingRequestEmail.mockRejectedValue(new Error('resend caído'))

    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 5 }))

    expect(res.status).toBe(200)
    expect(mocks.savePlan).toHaveBeenCalledWith('c1', expect.objectContaining({ maxVehiculos: 5 }))
  })

  it('si after() mismo lanza, la respuesta sigue siendo 200 y el plan quedó guardado', async () => {
    // Verifica que el try/catch alrededor de after() protege la respuesta cuando after() falla.
    mocks.after.mockImplementation(() => {
      throw new Error('after() falló')
    })

    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 5 }))

    expect(res.status).toBe(200)
    expect(mocks.savePlan).toHaveBeenCalledWith('c1', expect.objectContaining({ maxVehiculos: 5 }))
  })
})
