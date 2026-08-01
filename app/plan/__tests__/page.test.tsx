import { describe, it, expect, vi, beforeEach } from 'vitest'
// Componente real (sin mockear): la creación de un elemento JSX no invoca la
// función del componente, así que sirve solo como referencia para ubicarlo
// dentro del árbol devuelto por PlanPage() y leer el prop `inicial` que recibe.
import SelectorPlan from '@/components/plan/SelectorPlan'

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

// Recorre el árbol de elementos que devuelve PlanPage() buscando el nodo
// SelectorPlan y devuelve el prop `inicial` que le llegó.
type Nodo = { type?: unknown; props?: { children?: unknown; inicial?: number } } | null | undefined

function buscarInicial(nodo: unknown): number | undefined {
  if (!nodo || typeof nodo !== 'object') return undefined
  const n = nodo as Nodo
  if (n?.type === SelectorPlan && typeof n.props?.inicial === 'number') return n.props.inicial
  const children = n?.props?.children
  if (Array.isArray(children)) {
    for (const c of children) {
      const found = buscarInicial(c)
      if (found !== undefined) return found
    }
    return undefined
  }
  return buscarInicial(children)
}

describe('siembra del `inicial` que /plan pasa a SelectorPlan', () => {
  it('periodicidad ausente (cuenta anterior al selector) con cupo 12: inicial es 12, no 3 (no le hace perder su propio cupo)', async () => {
    mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: {},
      plan: { maxVehiculos: 12 }, // sin `periodicidad`
    })

    const result = await PlanPage()

    expect(buscarInicial(result)).toBe(12)
  })

  it('periodicidad null + tipoCuenta personal: inicial es 1', async () => {
    mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: {},
      plan: { maxVehiculos: 3, periodicidad: null },
      onboarding: { tipoCuenta: 'personal' },
    })

    const result = await PlanPage()

    expect(buscarInicial(result)).toBe(1)
  })

  it('periodicidad null + tipoCuenta empresa: inicial es 3', async () => {
    mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: {},
      plan: { maxVehiculos: 3, periodicidad: null },
      onboarding: { tipoCuenta: 'empresa' },
    })

    const result = await PlanPage()

    expect(buscarInicial(result)).toBe(3)
  })
})
