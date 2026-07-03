import { describe, it, expect, vi, beforeEach } from 'vitest'

const getVehicleByToken = vi.fn()
vi.mock('@/lib/data/vehicles', () => ({ getVehicleByToken: (...a: unknown[]) => getVehicleByToken(...a) }))
const verifyDriverPin = vi.fn()
const getDriver = vi.fn()
vi.mock('@/lib/data/drivers', () => ({
  verifyDriverPin: (...a: unknown[]) => verifyDriverPin(...a),
  getDriver: (...a: unknown[]) => getDriver(...a),
}))
const closeUsage = vi.fn()
vi.mock('@/lib/data/usages', () => ({ closeUsage: (...a: unknown[]) => closeUsage(...a) }))

import { POST } from '@/app/api/v/[token]/entregar/route'
function req(body: unknown) { return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest }
function ctx(token: string) { return { params: Promise.resolve({ token }) } }

beforeEach(() => {
  getVehicleByToken.mockReset(); verifyDriverPin.mockReset(); getDriver.mockReset(); closeUsage.mockReset()
  getVehicleByToken.mockResolvedValue({ id: 'v1', companyId: 'c1' })
  getDriver.mockResolvedValue({ id: 'd1', nombre: 'Ana', companyId: 'c1' })
  verifyDriverPin.mockResolvedValue('ok')
})

describe('POST entregar', () => {
  it('400 si faltan fotos', async () => {
    const res = await POST(req({ driverId: 'd1', pin: '1234', fotos: { tablero: 'a' } }), ctx('t'))
    expect(res.status).toBe(400)
  })
  it('401 PIN inválido', async () => {
    verifyDriverPin.mockResolvedValue('bad_pin')
    const res = await POST(req({ driverId: 'd1', pin: '9', fotos: { tablero: 'a', cabina: 'b' } }), ctx('t'))
    expect(res.status).toBe(401)
  })
  it('409 si no hay uso abierto', async () => {
    closeUsage.mockRejectedValue(new Error('no_open'))
    const res = await POST(req({ driverId: 'd1', pin: '1234', fotos: { tablero: 'a', cabina: 'b' } }), ctx('t'))
    expect(res.status).toBe(409)
  })
  it('200 cierra el uso con fotos', async () => {
    const res = await POST(req({ driverId: 'd1', pin: '1234', fotos: { tablero: 'a', cabina: 'b' }, dano: { hay: true, nota: 'rayón' } }), ctx('t'))
    expect(res.status).toBe(200)
    expect(closeUsage).toHaveBeenCalledWith('c1', 'v1', { id: 'd1', nombre: 'Ana' }, { tablero: 'a', cabina: 'b' }, { hay: true, nota: 'rayón' })
  })
})
