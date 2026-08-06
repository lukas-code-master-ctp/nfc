import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Guarda de servidor del dashboard (app/(app)/dashboard/page.tsx): la puerta
// que manda a una cuenta nueva a elegir plan antes de operar. Mismo patrón que
// app/plan/__tests__/page.test.tsx: mockear solo lo que toca Firebase/router y
// dejar correr la lógica pura (can, debeElegirPlan, debeElegirTipo, etc.) de
// verdad. `onboarding.completadoEn` va siempre seteado en la empresa mockeada
// para que la tarjeta de progreso no se calcule (evita mockear cargarSenales,
// pasosDe y el after() que la estampa) sin afectar la puerta que se prueba.
const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  getCompany: vi.fn(),
  saveOnboarding: vi.fn(),
  listVehicles: vi.fn(),
  listDocuments: vi.fn(),
  listAlertas: vi.fn(),
  listPendientesPara: vi.fn(),
  listPendientesDe: vi.fn(),
  ultimaMantencion: vi.fn(),
  cargarSenales: vi.fn(),
  after: vi.fn(),
  // `redirect` real de Next.js interrumpe el render lanzando: se simula igual
  // acá para poder distinguir "no redirigió" (la promesa resuelve) de
  // "redirigió a X" (la promesa rechaza con el destino en el mensaje).
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('@/lib/auth/membership', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/data/companies', () => ({
  getCompany: mocks.getCompany,
  saveOnboarding: mocks.saveOnboarding,
}))
vi.mock('@/lib/data/vehicles', () => ({ listVehicles: mocks.listVehicles }))
vi.mock('@/lib/data/documents', () => ({ listDocuments: mocks.listDocuments }))
vi.mock('@/lib/data/alertas', () => ({ listAlertas: mocks.listAlertas }))
vi.mock('@/lib/data/transferencias', () => ({
  listPendientesPara: mocks.listPendientesPara,
  listPendientesDe: mocks.listPendientesDe,
}))
vi.mock('@/lib/data/mantenciones', () => ({ ultimaMantencion: mocks.ultimaMantencion }))
vi.mock('@/lib/onboarding/cargar', () => ({ cargarSenales: mocks.cargarSenales }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: mocks.after,
}))

const { default: DashboardPage } = await import('@/app/(app)/dashboard/page')

type Role = 'admin' | 'editor' | 'viewer'

// Empresa mínima: `onboarding.completadoEn` seteado para saltar la tarjeta de
// progreso (no es lo que se prueba acá), `onboarding.tipoCuenta` siempre
// presente para no rebotar a /bienvenida (esa guarda corre primero).
function empresa(periodicidad: string | null | undefined) {
  const plan: Record<string, unknown> = { maxVehiculos: 3 }
  if (periodicidad !== undefined) plan.periodicidad = periodicidad
  return {
    id: 'c1',
    ownerUid: 'u1',
    company: {},
    plan,
    onboarding: { tipoCuenta: 'empresa', completadoEn: '2026-01-01T00:00:00.000Z' },
  }
}

function membresia(role: Role) {
  return { uid: 'u1', email: 'a@b.cl', companyId: 'c1', role }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.redirect.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  })
  mocks.listVehicles.mockResolvedValue([])
  mocks.listAlertas.mockResolvedValue([])
  mocks.listPendientesPara.mockResolvedValue([])
  mocks.listPendientesDe.mockResolvedValue([])
})

describe('puerta de elección de plan en el dashboard', () => {
  it('periodicidad null + admin: redirige a /plan (cuenta nueva sin elegir)', async () => {
    mocks.getMembership.mockResolvedValue(membresia('admin'))
    mocks.getCompany.mockResolvedValue(empresa(null))

    await expect(DashboardPage()).rejects.toThrow('REDIRECT:/plan')
    expect(mocks.redirect).toHaveBeenCalledWith('/plan')
  })

  it('periodicidad null + viewer: no redirige (evita el bucle dashboard↔/plan para quien no puede contratar)', async () => {
    mocks.getMembership.mockResolvedValue(membresia('viewer'))
    mocks.getCompany.mockResolvedValue(empresa(null))

    const result = await DashboardPage()

    expect(result).toBeTruthy()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('periodicidad null + editor: no redirige (mismo motivo que viewer)', async () => {
    mocks.getMembership.mockResolvedValue(membresia('editor'))
    mocks.getCompany.mockResolvedValue(empresa(null))

    const result = await DashboardPage()

    expect(result).toBeTruthy()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('periodicidad ausente + admin: no redirige (cuenta anterior al selector, nunca se le fuerza la pantalla)', async () => {
    mocks.getMembership.mockResolvedValue(membresia('admin'))
    mocks.getCompany.mockResolvedValue(empresa(undefined))

    const result = await DashboardPage()

    expect(result).toBeTruthy()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('periodicidad "mensual" + admin: no redirige (ya eligió plan)', async () => {
    mocks.getMembership.mockResolvedValue(membresia('admin'))
    mocks.getCompany.mockResolvedValue(empresa('mensual'))

    const result = await DashboardPage()

    expect(result).toBeTruthy()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})

// I2: el dashboard arma `prueba` con `estadoPrueba(gratisHasta)` solo, sin
// leer `plan.promo`. `DashboardPage()` se llama directo (sin renderizar), así
// que el elemento que devuelve es el objeto de React con `props` — se puede
// inspeccionar `result.props.prueba` sin montar `VehiclesBoard`, igual que las
// pruebas de arriba miran `mocks.redirect` sin renderizar nada.
describe('promoción en la franja del dashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T12:00:00Z')) // 2026-08-01 en Chile
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function empresaConPromo(overrides: { gratisHasta?: string | null; promoHasta?: string | null }) {
    return {
      id: 'c1',
      ownerUid: 'u1',
      company: {},
      plan: {
        maxVehiculos: 3,
        periodicidad: 'mensual',
        gratisHasta: overrides.gratisHasta,
        promo: overrides.promoHasta
          ? {
              codigo: 'TAPCAR2026',
              mesesGratis: 3,
              vehiculosIncluidos: 10,
              canjeadoEn: '2026-07-15T00:00:00.000Z',
              hasta: overrides.promoHasta,
            }
          : null,
      },
      onboarding: { tipoCuenta: 'empresa', completadoEn: '2026-01-01T00:00:00.000Z' },
    }
  }

  it('promoción vigente (fase promo): prueba.promo trae los días y la fecha', async () => {
    mocks.getMembership.mockResolvedValue(membresia('admin'))
    // Prueba terminó el 2026-07-15; promoción corre hasta el 2026-11-30. Hoy
    // (2026-08-01) cae dentro de la ventana de promoción.
    mocks.getCompany.mockResolvedValue(empresaConPromo({ gratisHasta: '2026-07-15', promoHasta: '2026-11-30' }))

    const result = (await DashboardPage()) as { props: { prueba: { promo: { diasRestantes: number; hasta: string } | null } } }

    expect(result.props.prueba.promo).toEqual({ diasRestantes: 121, hasta: '2026-11-30' })
  })

  it('promoción ya vencida (fase plena): prueba.promo es null, no le queda diciendo "activa" para siempre', async () => {
    mocks.getMembership.mockResolvedValue(membresia('admin'))
    mocks.getCompany.mockResolvedValue(empresaConPromo({ gratisHasta: '2026-05-01', promoHasta: '2026-06-01' }))

    const result = (await DashboardPage()) as { props: { prueba: { promo: unknown } } }

    expect(result.props.prueba.promo).toBeNull()
  })

  it('todavía en la prueba (fase prueba, sin promo canjeada): prueba.promo es null', async () => {
    mocks.getMembership.mockResolvedValue(membresia('admin'))
    mocks.getCompany.mockResolvedValue(empresaConPromo({ gratisHasta: '2026-08-31', promoHasta: null }))

    const result = (await DashboardPage()) as { props: { prueba: { promo: unknown } } }

    expect(result.props.prueba.promo).toBeNull()
  })
})
