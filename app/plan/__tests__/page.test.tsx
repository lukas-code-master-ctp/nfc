import { describe, it, expect, vi, beforeEach } from 'vitest'

// Guarda de servidor de /plan (app/plan/page.tsx): quién entra, quién rebota
// y a dónde. `can` y `debeElegirPlan`/`maxVehiculosDe` son lógica pura (sin
// Firebase) y se dejan correr de verdad; solo se mockean las tres cosas que
// tocan Firebase o el router: getMembership, getCompany y redirect.
const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  getCompany: vi.fn(),
  // `redirect` real de Next.js interrumpe el render lanzando: se simula igual
  // acá para poder distinguir "no redirigió" (la promesa resuelve) de
  // "redirigió a X" (la promesa rechaza con el destino en el mensaje).
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('@/lib/auth/membership', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/data/companies', () => ({ getCompany: mocks.getCompany }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

const { default: PlanPage } = await import('@/app/plan/page')

beforeEach(() => {
  mocks.getMembership.mockReset()
  mocks.getCompany.mockReset()
  mocks.redirect.mockClear()
})

describe('guarda de /plan', () => {
  it('sin sesión redirige a /login', async () => {
    mocks.getMembership.mockResolvedValue(null)

    await expect(PlanPage()).rejects.toThrow('REDIRECT:/login')
    expect(mocks.redirect).toHaveBeenCalledWith('/login')
    expect(mocks.getCompany).not.toHaveBeenCalled()
  })

  it('rol viewer redirige a /dashboard (no puede contratar)', async () => {
    mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'viewer' })

    await expect(PlanPage()).rejects.toThrow('REDIRECT:/dashboard')
    expect(mocks.redirect).toHaveBeenCalledWith('/dashboard')
  })

  it('rol editor redirige a /dashboard (no puede contratar)', async () => {
    mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'editor' })

    await expect(PlanPage()).rejects.toThrow('REDIRECT:/dashboard')
    expect(mocks.redirect).toHaveBeenCalledWith('/dashboard')
  })

  it('con periodicidad ya elegida (mensual) redirige a /facturacion', async () => {
    mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: {},
      plan: { maxVehiculos: 8, periodicidad: 'mensual' },
    })

    await expect(PlanPage()).rejects.toThrow('REDIRECT:/facturacion')
    expect(mocks.redirect).toHaveBeenCalledWith('/facturacion')
  })

  it('con periodicidad null (cuenta nueva sin elegir) no redirige: renderiza', async () => {
    mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: {},
      plan: { maxVehiculos: 3, periodicidad: null },
    })

    const result = await PlanPage()

    expect(result).toBeTruthy()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('con periodicidad ausente (cuenta anterior al selector) no redirige: puede entrar voluntariamente', async () => {
    mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: {},
      plan: { maxVehiculos: 12 }, // sin `periodicidad`
    })

    const result = await PlanPage()

    expect(result).toBeTruthy()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
