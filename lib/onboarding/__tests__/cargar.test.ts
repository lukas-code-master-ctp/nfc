import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Company } from '@/lib/types'

const mocks = vi.hoisted(() => ({
  countMembers: vi.fn(() => Promise.resolve(3)),
  countPendingInvitations: vi.fn(() => Promise.resolve(1)),
  listActiveDrivers: vi.fn(() => Promise.resolve([{ id: 'd1', nombre: 'Ana' }])),
}))

vi.mock('@/lib/data/members', () => ({ countMembers: mocks.countMembers }))
vi.mock('@/lib/data/invitations', () => ({ countPendingInvitations: mocks.countPendingInvitations }))
vi.mock('@/lib/data/drivers', () => ({ listActiveDrivers: mocks.listActiveDrivers }))

const { cargarSenales } = await import('@/lib/onboarding/cargar')

// El id de la empresa es distinto del companyId de la sesión a propósito: si
// fueran iguales, el test de "consulta con el companyId de la sesión" pasaría
// igual con una implementación que usara `args.company?.id`, que es incorrecta
// (rompería con `company: null`, consultando con undefined).
const COMPANY = {
  id: 'c-del-doc',
  ownerUid: 'u1',
  company: { razonSocial: 'Transportes SpA', rut: '', giro: '', direccion: '', telefono: '' },
  plan: { maxVehiculos: 3 },
  categorias: [{ id: 'a', nombre: 'Camionetas' }],
  pautaMantencion: { cadaKm: 10000, cadaMeses: null },
  createdAt: null,
} as Company

const base = {
  companyId: 'c1',
  company: COMPANY,
  vehiculos: 2,
  documentos: 5,
  primerVehiculoId: 'v1',
  vistos: ['chip'],
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockClear()
})

describe('cuenta personal: cero consultas extra', () => {
  it('no consulta miembros, invitaciones ni conductores', async () => {
    await cargarSenales({ ...base, tipoCuenta: 'personal' })
    expect(mocks.countMembers).not.toHaveBeenCalled()
    expect(mocks.countPendingInvitations).not.toHaveBeenCalled()
    expect(mocks.listActiveDrivers).not.toHaveBeenCalled()
  })

  it('igual devuelve las señales que sí sirven en cuenta personal', async () => {
    const s = await cargarSenales({ ...base, tipoCuenta: 'personal' })
    expect(s.vehiculos).toBe(2)
    expect(s.documentos).toBe(5)
    expect(s.primerVehiculoId).toBe('v1')
    expect(s.vistos).toEqual(['chip'])
  })
})

describe('cuenta empresa: consulta lo que no está en el render', () => {
  it('consulta las tres, con el companyId de la sesión', async () => {
    await cargarSenales({ ...base, tipoCuenta: 'empresa' })
    expect(mocks.countMembers).toHaveBeenCalledWith('c1')
    expect(mocks.countPendingInvitations).toHaveBeenCalledWith('c1')
    expect(mocks.listActiveDrivers).toHaveBeenCalledWith('c1')
  })

  it('traduce los resultados a señales', async () => {
    const s = await cargarSenales({ ...base, tipoCuenta: 'empresa' })
    expect(s.miembros).toBe(3)
    expect(s.invitacionesPendientes).toBe(1)
    expect(s.conductores).toBe(1)
  })
})

describe('señales que salen de la empresa', () => {
  it('toma razón social y categorías', async () => {
    const s = await cargarSenales({ ...base, tipoCuenta: 'empresa' })
    expect(s.razonSocial).toBe('Transportes SpA')
    expect(s.categorias).toBe(1)
  })

  it('la pauta cuenta con km, con meses, o con ambos', async () => {
    const km = await cargarSenales({ ...base, tipoCuenta: 'empresa' })
    expect(km.pautaConfigurada).toBe(true)

    const meses = await cargarSenales({
      ...base, tipoCuenta: 'empresa',
      company: { ...COMPANY, pautaMantencion: { cadaKm: null, cadaMeses: 6 } },
    })
    expect(meses.pautaConfigurada).toBe(true)
  })

  it('una pauta vacía o ausente no cuenta como configurada', async () => {
    const vacia = await cargarSenales({
      ...base, tipoCuenta: 'empresa',
      company: { ...COMPANY, pautaMantencion: { cadaKm: null, cadaMeses: null } },
    })
    expect(vacia.pautaConfigurada).toBe(false)

    const ausente = await cargarSenales({
      ...base, tipoCuenta: 'empresa',
      company: { ...COMPANY, pautaMantencion: undefined },
    })
    expect(ausente.pautaConfigurada).toBe(false)
  })

  it('sin empresa cargada no explota', async () => {
    const s = await cargarSenales({ ...base, tipoCuenta: 'empresa', company: null })
    expect(s.razonSocial).toBe('')
    expect(s.categorias).toBe(0)
    expect(s.pautaConfigurada).toBe(false)
  })
})
