import { describe, it, expect, vi, beforeEach } from 'vitest'

const getVehicleByToken = vi.fn()
vi.mock('@/lib/data/vehicles', () => ({ getVehicleByToken: (...a: unknown[]) => getVehicleByToken(...a) }))
const verifyDriverPin = vi.fn()
vi.mock('@/lib/data/drivers', () => ({ verifyDriverPin: (...a: unknown[]) => verifyDriverPin(...a) }))
const getOpenUsage = vi.fn()
vi.mock('@/lib/data/usages', () => ({ getOpenUsage: (...a: unknown[]) => getOpenUsage(...a) }))
const createUsagePhotoUrl = vi.fn()
vi.mock('@/lib/storage/signedUrls', () => ({ createUsagePhotoUrl: (...a: unknown[]) => createUsagePhotoUrl(...a) }))

import { POST } from '@/app/api/v/[token]/upload-url/route'
function req(body: unknown) { return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest }
function ctx(token: string) { return { params: Promise.resolve({ token }) } }

beforeEach(() => {
  getVehicleByToken.mockReset(); verifyDriverPin.mockReset(); getOpenUsage.mockReset(); createUsagePhotoUrl.mockReset()
  getVehicleByToken.mockResolvedValue({ id: 'v1', companyId: 'c1' })
  verifyDriverPin.mockResolvedValue('ok')
  getOpenUsage.mockResolvedValue({ id: 'u1', estado: 'abierto' })
  createUsagePhotoUrl.mockResolvedValue({ uploadUrl: 'https://signed.example/upload', filePath: 'vehicles/v1/usages/foo-tablero' })
})

describe('POST upload-url', () => {
  it('401 PIN inválido', async () => {
    verifyDriverPin.mockResolvedValue('bad_pin')
    const res = await POST(req({ driverId: 'd1', pin: '9', tipo: 'tablero' }), ctx('t'))
    expect(res.status).toBe(401)
    expect(createUsagePhotoUrl).not.toHaveBeenCalled()
  })

  it('409 si no hay uso abierto', async () => {
    getOpenUsage.mockResolvedValue(null)
    const res = await POST(req({ driverId: 'd1', pin: '1234', tipo: 'tablero' }), ctx('t'))
    expect(res.status).toBe(409)
    expect(createUsagePhotoUrl).not.toHaveBeenCalled()
  })

  it('200 con uso abierto', async () => {
    const res = await POST(req({ driverId: 'd1', pin: '1234', tipo: 'tablero' }), ctx('t'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ uploadUrl: 'https://signed.example/upload', filePath: 'vehicles/v1/usages/foo-tablero' })
    expect(createUsagePhotoUrl).toHaveBeenCalledWith('v1', 'tablero', 'image/jpeg')
  })
})
