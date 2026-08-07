import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { LANZAMIENTO_HASTA } from '@/lib/plan/prueba'

const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  can: vi.fn(() => true),
  getCompany: vi.fn(),
  savePlan: vi.fn().mockResolvedValue(undefined),
  listVehicles: vi.fn().mockResolvedValue([]),
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
vi.mock('@/lib/data/vehicles', () => ({ listVehicles: mocks.listVehicles }))
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
  mocks.listVehicles.mockResolvedValue([])
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
  it('guarda el plan con gratisHasta = LANZAMIENTO_HASTA y una suscripción inicial, y registra la solicitud', async () => {
    vi.useFakeTimers()
    // OJO: esta fecha YA NO discrimina la fuente del "hoy". Con
    // `DIAS_PRUEBA` (prueba de 30 días por cuenta) el 02:00 UTC del 2 de
    // agosto detectaba el desfase de día entre `hoyEnChile` y
    // `toISOString().slice(0,10)`, porque el resultado dependía del valor
    // exacto de "hoy". Con `LANZAMIENTO_HASTA` fija, cualquier "hoy" dentro
    // de la ventana (sea el de Chile o el de UTC) da el mismo
    // `gratisHasta`, así que las dos fuentes de fecha coinciden acá. El caso
    // que sí discrimina es el borde de `LANZAMIENTO_HASTA` mismo, más abajo
    // ("el borde de LANZAMIENTO_HASTA...").
    vi.setSystemTime(new Date('2026-08-02T02:00:00Z'))

    const res = await POST(req({ periodicidad: 'anual', maxVehiculos: 8 }))

    expect(res.status).toBe(200)
    expect(mocks.savePlan).toHaveBeenCalledWith('c1', {
      periodicidad: 'anual',
      maxVehiculos: 8,
      gratisHasta: LANZAMIENTO_HASTA,
      suscripcion: {
        flowCustomerId: null,
        tarjeta: null,
        cicloDesde: null,
        proximoCobro: '2026-09-02',
        impagoDesde: null,
        cupoProximoCiclo: null,
        cancelaEn: null,
      },
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

  it('el alta después de la ventana de lanzamiento guarda gratisHasta: null y proximoCobro de hoy', async () => {
    vi.useFakeTimers()
    // Un día después del último día gratis: en Chile (UTC-4) sigue siendo
    // 2026-09-02 a esta hora.
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z'))

    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 4 }))

    expect(res.status).toBe(200)
    expect(mocks.savePlan).toHaveBeenCalledWith('c1', {
      periodicidad: 'mensual',
      maxVehiculos: 4,
      gratisHasta: null,
      suscripcion: expect.objectContaining({ proximoCobro: '2026-09-02' }),
    })
  })

  it('el borde de LANZAMIENTO_HASTA: a esta hora sigue siendo el último día gratis en Chile', async () => {
    vi.useFakeTimers()
    // 02:00 UTC del 2 de septiembre es todavía 2026-09-01 en Chile (UTC-4) —
    // el último día gratis, inclusive. Si la ruta calculara "hoy" con
    // `toISOString().slice(0,10)` en vez de `hoyEnChile`, leería "2026-09-02"
    // (ya pasada la ventana) y guardaría `gratisHasta: null`, negándole a
    // quien se registra entre las 20:00 y las 23:59 hora Chile del último día
    // de la promoción su último día gratis, y dejándolo con cobro inmediato.
    vi.setSystemTime(new Date('2026-09-02T02:00:00Z'))

    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 4 }))

    expect(res.status).toBe(200)
    expect(mocks.savePlan).toHaveBeenCalledWith('c1', expect.objectContaining({
      gratisHasta: LANZAMIENTO_HASTA,
      suscripcion: expect.objectContaining({ proximoCobro: '2026-09-02' }),
    }))
  })
})

// El alta no puede ACORTAR una fecha que la empresa ya tenía (ej. una
// promoción canjeada antes de elegir plan, o el backfill de la migración
// dejándola con un gratisHasta posterior a LANZAMIENTO_HASTA). Espejo de la
// guarda que ya tiene `calcularParche` en la migración.
describe('el alta no acorta un gratisHasta posterior que la empresa ya tenía', () => {
  it('empresa con gratisHasta posterior a LANZAMIENTO_HASTA lo conserva, no lo pisa', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-02T12:00:00Z'))
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: { razonSocial: 'Empresa Test' },
      plan: { maxVehiculos: 3, gratisHasta: '2026-12-25' },
    })

    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 5 }))

    expect(res.status).toBe(200)
    expect(mocks.savePlan).toHaveBeenCalledWith('c1', expect.objectContaining({
      gratisHasta: '2026-12-25',
      suscripcion: expect.objectContaining({ proximoCobro: '2026-12-26' }),
    }))
  })

  it('empresa con gratisHasta posterior, dando de alta DESPUÉS de LANZAMIENTO_HASTA, igual lo conserva', async () => {
    vi.useFakeTimers()
    // Sin la guarda esta línea escribiría gratisHasta: null y borraría la
    // fecha por completo, porque gratisHastaDeAlta(hoy) ya devuelve null
    // pasada la ventana.
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'))
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: { razonSocial: 'Empresa Test' },
      plan: { maxVehiculos: 3, gratisHasta: '2026-12-25' },
    })

    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 5 }))

    expect(res.status).toBe(200)
    expect(mocks.savePlan).toHaveBeenCalledWith('c1', expect.objectContaining({
      gratisHasta: '2026-12-25',
      suscripcion: expect.objectContaining({ proximoCobro: '2026-12-26' }),
    }))
  })

  it('empresa con gratisHasta igual a LANZAMIENTO_HASTA se comporta igual que sin fecha previa', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-02T12:00:00Z'))
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: { razonSocial: 'Empresa Test' },
      plan: { maxVehiculos: 3, gratisHasta: LANZAMIENTO_HASTA },
    })

    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 5 }))

    expect(res.status).toBe(200)
    expect(mocks.savePlan).toHaveBeenCalledWith('c1', expect.objectContaining({
      gratisHasta: LANZAMIENTO_HASTA,
    }))
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

// C1 (bloqueante), capa 2: una cuenta anterior al selector (periodicidad
// ausente) que entra a /plan sin cambiar el número sembrado no puede reducir
// su propio cupo bajo lo que ya tiene cargado. Es la red que protege el
// endpoint venga por donde venga la llamada, no solo el valor inicial de la
// pantalla (esa es la capa 1, en app/plan/page.tsx).
describe('cupo por debajo del uso (C1)', () => {
  it('409 cupo_menor_al_uso si maxVehiculos queda bajo la cantidad de vehículos ya cargados, y savePlan no se llamó', async () => {
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: { razonSocial: 'Empresa Test' },
      plan: { maxVehiculos: 12 }, // periodicidad ausente: cuenta anterior al selector
    })
    mocks.listVehicles.mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ id: `v${i}` })))

    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 3 }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body).toEqual({ error: 'cupo_menor_al_uso', vehiculos: 10 })
    expect(mocks.savePlan).not.toHaveBeenCalled()
  })

  it('200 si maxVehiculos es igual o mayor a los vehículos ya cargados', async () => {
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: { razonSocial: 'Empresa Test' },
      plan: { maxVehiculos: 12 },
    })
    mocks.listVehicles.mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ id: `v${i}` })))

    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 10 }))

    expect(res.status).toBe(200)
    expect(mocks.savePlan).toHaveBeenCalledWith('c1', expect.objectContaining({ maxVehiculos: 10 }))
  })
})

// I2: pedir más de MAX_VEHICULOS_SELF_SERVICE no puede dejar la cuenta sin
// periodicidad (eso la encierra en el rebote a /plan). El endpoint acepta
// `solicitados` y, sobre el tope, guarda igual con el tope y deja constancia
// de lo pedido en la solicitud de facturación.
describe('solicitud sobre el tope self-service (I2)', () => {
  it('con solicitados > 30 guarda maxVehiculos = 30 y responde 200 (la cuenta queda operativa)', async () => {
    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 45, solicitados: 45 }))

    expect(res.status).toBe(200)
    expect(mocks.savePlan).toHaveBeenCalledWith('c1', expect.objectContaining({ maxVehiculos: 30 }))
  })

  it('menciona la cantidad solicitada en el message del billingRequest', async () => {
    await POST(req({ periodicidad: 'mensual', maxVehiculos: 45, solicitados: 45 }))

    expect(mocks.createBillingRequest).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('45') }),
    )
  })

  it('solicitados no numérico o no razonable se ignora sin fallar la petición', async () => {
    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 5, solicitados: 'muchos' }))

    expect(res.status).toBe(200)
    expect(mocks.savePlan).toHaveBeenCalledWith('c1', expect.objectContaining({ maxVehiculos: 5 }))
  })
})

// CRÍTICO: una empresa anterior al selector puede tener un cupo por ENCIMA
// del tope self-service, otorgado a mano por un admin de plataforma (ej.
// Inmobiliaria Isla SpA: maxVehiculos 50, 19 vehículos, periodicidad null).
// Forzar el tope de 30 en la rama `excedeTope` le bajaría el cupo en
// silencio y sin vuelta atrás (el 409 `plan_ya_elegido` cierra la puerta a
// reintentar). El endpoint debe conservar el mayor entre el tope y el cupo
// que la empresa ya tenía.
describe('alta no puede bajar un cupo que la empresa ya tenía (C-CRÍTICO)', () => {
  it('empresa con maxVehiculos 50 (sin periodicidad) que pide 50 conserva 50, no 30', async () => {
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: { razonSocial: 'Inmobiliaria Isla SpA' },
      plan: { maxVehiculos: 50 }, // periodicidad ausente: cuenta anterior al selector
    })
    mocks.listVehicles.mockResolvedValue(Array.from({ length: 19 }, (_, i) => ({ id: `v${i}` })))

    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 50, solicitados: 50 }))

    expect(res.status).toBe(200)
    expect(mocks.savePlan).toHaveBeenCalledWith('c1', expect.objectContaining({ maxVehiculos: 50 }))
  })

  it('empresa con maxVehiculos 50 y 35 vehículos cargados no cae en el callejón sin salida cupo_menor_al_uso', async () => {
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: { razonSocial: 'Inmobiliaria Isla SpA' },
      plan: { maxVehiculos: 50 },
    })
    mocks.listVehicles.mockResolvedValue(Array.from({ length: 35 }, (_, i) => ({ id: `v${i}` })))

    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 50, solicitados: 50 }))

    expect(res.status).toBe(200)
    expect(mocks.savePlan).toHaveBeenCalledWith('c1', expect.objectContaining({ maxVehiculos: 50 }))
  })

  it('el camino ordinario (≤30) sigue igual: cupo 3 pidiendo 5 obtiene 5', async () => {
    mocks.getCompany.mockResolvedValue({
      id: 'c1',
      ownerUid: 'u1',
      company: { razonSocial: 'Empresa Test' },
      plan: { maxVehiculos: 3 },
    })

    const res = await POST(req({ periodicidad: 'mensual', maxVehiculos: 5 }))

    expect(res.status).toBe(200)
    expect(mocks.savePlan).toHaveBeenCalledWith('c1', expect.objectContaining({ maxVehiculos: 5 }))
  })
})
