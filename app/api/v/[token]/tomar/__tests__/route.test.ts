import { describe, it, expect, vi, beforeEach } from 'vitest'

const getVehicleByToken = vi.fn()
vi.mock('@/lib/data/vehicles', () => ({ getVehicleByToken: (...a: unknown[]) => getVehicleByToken(...a) }))
const verifyDriverPin = vi.fn()
const getDriver = vi.fn()
const incrementDriverStats = vi.fn()
vi.mock('@/lib/data/drivers', () => ({
  verifyDriverPin: (...a: unknown[]) => verifyDriverPin(...a),
  getDriver: (...a: unknown[]) => getDriver(...a),
  incrementDriverStats: (...a: unknown[]) => incrementDriverStats(...a),
}))
const openUsage = vi.fn()
vi.mock('@/lib/data/usages', () => ({ openUsage: (...a: unknown[]) => openUsage(...a) }))
const createAlerta = vi.fn()
vi.mock('@/lib/data/alertas', () => ({ createAlerta: (...a: unknown[]) => createAlerta(...a) }))

import { POST } from '@/app/api/v/[token]/tomar/route'

function req(body: unknown) { return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest }
function ctx(token: string) { return { params: Promise.resolve({ token }) } }

beforeEach(() => {
  getVehicleByToken.mockReset(); verifyDriverPin.mockReset(); getDriver.mockReset(); openUsage.mockReset()
  createAlerta.mockReset(); incrementDriverStats.mockReset()
  getVehicleByToken.mockResolvedValue({ id: 'v1', companyId: 'c1', patente: 'ABCD12' })
  getDriver.mockResolvedValue({ id: 'd1', nombre: 'Ana', companyId: 'c1' })
  openUsage.mockResolvedValue({ usage: { id: 'u1' }, forced: null })
})

describe('POST tomar', () => {
  it('404 token inválido', async () => {
    getVehicleByToken.mockResolvedValue(null)
    expect((await POST(req({ driverId: 'd1', pin: '1234' }), ctx('x'))).status).toBe(404)
  })
  it('401 PIN inválido', async () => {
    verifyDriverPin.mockResolvedValue('bad_pin')
    expect((await POST(req({ driverId: 'd1', pin: '9999' }), ctx('t'))).status).toBe(401)
  })
  it('429 bloqueado', async () => {
    verifyDriverPin.mockResolvedValue('locked')
    expect((await POST(req({ driverId: 'd1', pin: '1234' }), ctx('t'))).status).toBe(429)
  })
  it('200 abre el uso', async () => {
    verifyDriverPin.mockResolvedValue('ok')
    const res = await POST(req({ driverId: 'd1', pin: '1234' }), ctx('t'))
    expect(res.status).toBe(200)
    expect(openUsage).toHaveBeenCalledWith('c1', 'v1', { id: 'd1', nombre: 'Ana' })
    expect(incrementDriverStats).toHaveBeenCalledWith('d1', 'usos')
  })
  it('en forced-close solo incrementa sinEntrega del conductor anterior (sin alerta)', async () => {
    verifyDriverPin.mockResolvedValue('ok')
    openUsage.mockResolvedValue({ usage: { id: 'u2' }, forced: { id: 'viejo', driverId: 'dViejo', driverNombre: 'Beto', tomadoEn: 't' } })
    const res = await POST(req({ driverId: 'd1', pin: '1234' }), ctx('t'))
    expect(res.status).toBe(200)
    expect(incrementDriverStats).toHaveBeenCalledWith('dViejo', 'sinEntrega')
    expect(createAlerta).not.toHaveBeenCalled()
  })
})
