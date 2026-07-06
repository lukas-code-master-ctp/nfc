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
const closeUsage = vi.fn()
const getUsage = vi.fn()
vi.mock('@/lib/data/usages', () => ({
  closeUsage: (...a: unknown[]) => closeUsage(...a),
  getUsage: (...a: unknown[]) => getUsage(...a),
}))
const createAlerta = vi.fn()
vi.mock('@/lib/data/alertas', () => ({ createAlerta: (...a: unknown[]) => createAlerta(...a) }))
const sendUsageAlertEmail = vi.fn()
vi.mock('@/lib/email/resend', () => ({ sendUsageAlertEmail: (...a: unknown[]) => sendUsageAlertEmail(...a) }))
vi.mock('@/lib/data/companies', () => ({ getCompany: () => Promise.resolve({ ownerUid: 'o1' }) }))
vi.mock('@/lib/data/members', () => ({ alertRecipientEmails: () => Promise.resolve(['o@b.cl']) }))
const after = vi.fn()
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => void) => after(fn),
}))
const analyzeUsage = vi.fn()
vi.mock('@/lib/ai/analyzeUsage', () => ({ analyzeUsage: (...a: unknown[]) => analyzeUsage(...a) }))

import { POST } from '@/app/api/v/[token]/entregar/route'
function req(body: unknown) { return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest }
function ctx(token: string) { return { params: Promise.resolve({ token }) } }

beforeEach(() => {
  getVehicleByToken.mockReset(); verifyDriverPin.mockReset(); getDriver.mockReset(); closeUsage.mockReset()
  after.mockReset(); analyzeUsage.mockReset(); incrementDriverStats.mockReset()
  createAlerta.mockReset(); getUsage.mockReset(); getUsage.mockResolvedValue({ driverNombre: 'Ana', driverId: 'dAna' })
  sendUsageAlertEmail.mockReset()
  getVehicleByToken.mockResolvedValue({ id: 'v1', companyId: 'c1', patente: 'ABCD12' })
  getDriver.mockResolvedValue({ id: 'd1', nombre: 'Ana', companyId: 'c1' })
  verifyDriverPin.mockResolvedValue('ok')
  closeUsage.mockResolvedValue({ id: 'u1', entregaIrregular: false, driverOriginal: { id: 'd1', nombre: 'Ana' }, tomadoEn: '2026-01-01' })
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
  it('agenda el análisis IA tras cerrar el uso', async () => {
    closeUsage.mockResolvedValue({ id: 'u1', entregaIrregular: false, driverOriginal: { id: 'd1', nombre: 'Ana' }, tomadoEn: '2026-01-01' })
    const res = await POST(req({ driverId: 'd1', pin: '1234', fotos: { tablero: 'a', cabina: 'b' } }), ctx('t'))
    expect(res.status).toBe(200)
    expect(after).toHaveBeenCalledTimes(1)
    // ejecutar el callback agendado y verificar que llama a analyzeUsage con el id
    const cb = after.mock.calls[0][0]
    cb()
    expect(analyzeUsage).toHaveBeenCalledWith('u1')
  })
  it('crea una alerta de daño cuando se reporta daño', async () => {
    closeUsage.mockResolvedValue({ id: 'u1', entregaIrregular: false, driverOriginal: { id: 'd1', nombre: 'Ana' }, tomadoEn: '2026-01-01' })
    const res = await POST(req({ driverId: 'd1', pin: '1234', fotos: { tablero: 'a', cabina: 'b' }, dano: { hay: true, nota: 'rayón' } }), ctx('t'))
    expect(res.status).toBe(200)
    expect(createAlerta).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'dano', usageId: 'u1', nota: 'rayón', companyId: 'c1', vehicleId: 'v1' }))
    expect(incrementDriverStats).toHaveBeenCalledWith('dAna', 'danos')
  })
  it('entrega irregular: alerta sin_entrega al conductor original + email + contador', async () => {
    closeUsage.mockResolvedValue({ id: 'u1', entregaIrregular: true, driverOriginal: { id: 'dViejo', nombre: 'Beto' }, tomadoEn: '2026-01-01' })
    const res = await POST(req({ driverId: 'd1', pin: '1234', fotos: { tablero: 'a', cabina: 'b' } }), ctx('t'))
    expect(res.status).toBe(200)
    expect(createAlerta).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'sin_entrega', usageId: 'u1', driverNombre: 'Beto', companyId: 'c1', vehicleId: 'v1' }))
    expect(incrementDriverStats).toHaveBeenCalledWith('dViejo', 'sinEntrega')
    expect(sendUsageAlertEmail).toHaveBeenCalledWith('o@b.cl', expect.objectContaining({ patente: 'ABCD12', driverNombre: 'Beto', entregadoPorNombre: 'Ana' }))
  })
  it('entrega normal (mismo conductor): no crea alerta sin_entrega ni suma sinEntrega', async () => {
    closeUsage.mockResolvedValue({ id: 'u1', entregaIrregular: false, driverOriginal: { id: 'd1', nombre: 'Ana' }, tomadoEn: '2026-01-01' })
    const res = await POST(req({ driverId: 'd1', pin: '1234', fotos: { tablero: 'a', cabina: 'b' } }), ctx('t'))
    expect(res.status).toBe(200)
    expect(createAlerta).not.toHaveBeenCalled()
    expect(incrementDriverStats).not.toHaveBeenCalledWith('d1', 'sinEntrega')
    expect(sendUsageAlertEmail).not.toHaveBeenCalled()
  })
})
