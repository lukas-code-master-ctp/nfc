import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/membership', () => ({ getMembership: (...a: unknown[]) => getMembership(...a) }))
const listDrivers = vi.hoisted(() => vi.fn())
const createDriver = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/drivers', () => ({
  listDrivers: (...a: unknown[]) => listDrivers(...a),
  createDriver: (...a: unknown[]) => createDriver(...a),
}))

import { POST } from '@/app/api/conductores/import/route'

function req(body: unknown) { return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest }

beforeEach(() => {
  getMembership.mockReset(); listDrivers.mockReset(); createDriver.mockReset()
  getMembership.mockResolvedValue({ uid: 'me', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
  listDrivers.mockResolvedValue([{ id: 'd1', nombre: 'Ana' }])
  createDriver.mockResolvedValue({ id: 'nuevo' })
})

describe('POST /api/conductores/import', () => {
  it('crea las filas válidas y omite duplicados/inválidas', async () => {
    const res = await POST(req({ filas: [
      { nombre: 'Beto', pin: '1234' },
      { nombre: 'ana', pin: '5678' },            // duplicado contra el padrón
      { nombre: '', pin: '1111' },               // sin nombre
      { nombre: 'Carla', rut: '1-9', pin: '22' } // pin inválido
    ] }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ creados: 1, omitidos: 3 })
    expect(createDriver).toHaveBeenCalledTimes(1)
    expect(createDriver).toHaveBeenCalledWith('c1', 'me', { nombre: 'Beto', rut: undefined, pin: '1234' })
  })
  it('400 si no vienen filas o son más de 100', async () => {
    expect((await POST(req({}))).status).toBe(400)
    const muchas = Array.from({ length: 101 }, (_, i) => ({ nombre: `n${i}`, pin: '1234' }))
    expect((await POST(req({ filas: muchas }))).status).toBe(400)
  })
  it('403 si no es admin', async () => {
    getMembership.mockResolvedValue({ uid: 'me', email: 'a@b.cl', companyId: 'c1', role: 'viewer' })
    expect((await POST(req({ filas: [{ nombre: 'X', pin: '1234' }] }))).status).toBe(403)
  })
})
