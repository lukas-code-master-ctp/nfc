import { describe, it, expect, vi, beforeEach } from 'vitest'
// Componentes reales (sin mockear): crear un elemento JSX no invoca la función
// del componente, así que sirven solo como referencia para ubicarlos dentro
// del árbol devuelto por FacturacionPage().
import PanelPromo from '@/components/plan/PanelPromo'

// I1: canjear un código ANTES de elegir plan solapa la promoción con la
// prueba (`aplicarCanje` calcula `hasta` desde `gratisHasta: null`, así que la
// promoción arranca hoy en vez de donde termina la prueba que "Elegir plan"
// recién va a fijar). El arreglo es que `<PanelPromo />` solo se monte cuando
// `yaEligio` — se prueba inspeccionando el árbol de elementos, sin renderizar
// (mismo patrón que app/plan/__tests__/page.test.tsx).
const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  getCompany: vi.fn(),
  listVehicles: vi.fn(),
}))

vi.mock('@/lib/auth/membership', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/data/companies', () => ({ getCompany: mocks.getCompany }))
vi.mock('@/lib/data/vehicles', () => ({ listVehicles: mocks.listVehicles }))

const { default: FacturacionPage } = await import('@/app/(app)/facturacion/page')

beforeEach(() => {
  mocks.getMembership.mockReset()
  mocks.getCompany.mockReset()
  mocks.listVehicles.mockReset()
  mocks.listVehicles.mockResolvedValue([])
  mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
})

// Recorre el árbol de elementos buscando el tipo dado.
type Nodo = { type?: unknown; props?: { children?: unknown } } | null | undefined

function contiene(nodo: unknown, tipo: unknown): boolean {
  if (!nodo || typeof nodo !== 'object') return false
  const n = nodo as Nodo
  if (n?.type === tipo) return true
  const children = n?.props?.children
  if (Array.isArray(children)) return children.some((c) => contiene(c, tipo))
  return contiene(children, tipo)
}

describe('PanelPromo en Facturación (I1)', () => {
  it('sin plan elegido (periodicidad null): NO monta PanelPromo, aunque no haya promo', async () => {
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: {},
      plan: { maxVehiculos: 3, periodicidad: null },
    })

    const result = await FacturacionPage()

    expect(contiene(result, PanelPromo)).toBe(false)
  })

  it('cuenta anterior al selector (periodicidad ausente): tampoco monta PanelPromo', async () => {
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: {},
      plan: { maxVehiculos: 3 }, // sin `periodicidad`
    })

    const result = await FacturacionPage()

    expect(contiene(result, PanelPromo)).toBe(false)
  })

  it('con plan ya elegido y sin promo: SÍ monta PanelPromo', async () => {
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: {},
      plan: { maxVehiculos: 3, periodicidad: 'mensual' },
    })

    const result = await FacturacionPage()

    expect(contiene(result, PanelPromo)).toBe(true)
  })

  it('con plan ya elegido pero YA con promo canjeada: no lo vuelve a mostrar (un código por empresa)', async () => {
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: {},
      plan: {
        maxVehiculos: 3,
        periodicidad: 'mensual',
        promo: {
          codigo: 'TAPCAR2026',
          mesesGratis: 3,
          vehiculosIncluidos: 10,
          canjeadoEn: '2026-07-15T00:00:00.000Z',
          hasta: '2026-11-30',
        },
      },
    })

    const result = await FacturacionPage()

    expect(contiene(result, PanelPromo)).toBe(false)
  })
})
