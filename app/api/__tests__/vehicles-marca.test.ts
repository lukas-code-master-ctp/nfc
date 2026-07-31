import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  listVehicles: vi.fn(),
  createVehicle: vi.fn(),
  getCompany: vi.fn(),
}))

vi.mock('@/lib/auth/membership', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/data/vehicles', () => ({
  listVehicles: mocks.listVehicles,
  createVehicle: mocks.createVehicle,
}))
vi.mock('@/lib/data/companies', () => ({ getCompany: mocks.getCompany }))

const { POST } = await import('@/app/api/vehicles/route')

const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as unknown as NextRequest

const alta = (marca: string) => req({ patente: 'ABCD12', marca, modelo: 'Swift', anio: '2024' })

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
  mocks.listVehicles.mockResolvedValue([])
  mocks.getCompany.mockResolvedValue({ plan: { maxVehiculos: 10 } })
  mocks.createVehicle.mockResolvedValue({ id: 'v1' })
})

/** La marca con la que se llamó a createVehicle. */
const marcaGuardada = () => (mocks.createVehicle.mock.calls[0][2] as { marca: string }).marca

describe('la marca se normaliza en el servidor', () => {
  // El combobox solo sugiere: nunca se confía en lo que manda el cliente, y así
  // queda cubierto también quien cree un vehículo por otra vía.
  it('lleva a la forma canónica lo que llega sucio', async () => {
    await POST(alta('  subaru '))
    expect(marcaGuardada()).toBe('Subaru')
  })

  it('a una marca desconocida solo le saca los espacios', async () => {
    await POST(alta('  JMC '))
    expect(marcaGuardada()).toBe('JMC')
  })
})

describe('lo que no cambia', () => {
  it('sigue exigiendo los campos obligatorios', async () => {
    const res = await POST(req({ patente: 'ABCD12', modelo: 'Swift' }))
    expect(res.status).toBe(400)
    expect(mocks.createVehicle).not.toHaveBeenCalled()
  })

  it('sigue respetando el cupo del plan', async () => {
    mocks.listVehicles.mockResolvedValue([{ id: 'x' }])
    mocks.getCompany.mockResolvedValue({ plan: { maxVehiculos: 1 } })
    const res = await POST(alta('Subaru'))
    expect(res.status).toBe(409)
    expect(mocks.createVehicle).not.toHaveBeenCalled()
  })
})
