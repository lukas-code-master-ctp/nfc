import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const getMembership = vi.fn()
const getTransferenciaByToken = vi.fn()
const markAceptada = vi.fn()
const transferirVehiculo = vi.fn()
const getCompany = vi.fn()
const listVehicles = vi.fn()
const getUser = vi.fn()
const sendAceptada = vi.fn()

vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))
vi.mock('@/lib/data/transferencias', () => ({
  getTransferenciaByToken: (...a: unknown[]) => getTransferenciaByToken(...a),
  markAceptada: (...a: unknown[]) => markAceptada(...a),
}))
vi.mock('@/lib/data/transferirVehiculo', () => ({
  transferirVehiculo: (...a: unknown[]) => transferirVehiculo(...a),
}))
vi.mock('@/lib/data/companies', () => ({ getCompany: (...a: unknown[]) => getCompany(...a) }))
vi.mock('@/lib/data/vehicles', () => ({ listVehicles: (...a: unknown[]) => listVehicles(...a) }))
vi.mock('@/lib/firebase/admin', () => ({ adminAuth: { getUser: (...a: unknown[]) => getUser(...a) } }))
vi.mock('@/lib/email/resend', () => ({
  sendTransferenciaAceptadaEmail: (...a: unknown[]) => sendAceptada(...a),
}))

import { POST } from '@/app/api/transferencias/[token]/aceptar/route'

const sinBody = () => ({}) as NextRequest
const ctx = (token: string) => ({ params: Promise.resolve({ token }) })
const futuro = '2999-01-01T00:00:00.000Z'

beforeEach(() => {
  getMembership.mockReset(); getTransferenciaByToken.mockReset(); markAceptada.mockReset()
  transferirVehiculo.mockReset(); getCompany.mockReset(); listVehicles.mockReset()
  getUser.mockReset(); sendAceptada.mockReset()

  getMembership.mockResolvedValue({ uid: 'u2', email: 'nuevo@dos.cl', companyId: 'c2', role: 'admin' })
  getTransferenciaByToken.mockResolvedValue({
    id: 't1', vehicleId: 'v1', patente: 'ABCD-12', deCompanyId: 'c1',
    paraEmail: 'nuevo@dos.cl', status: 'pendiente', expiresAt: futuro, creadaPorUid: 'u1',
  })
  getCompany.mockResolvedValue({ plan: { maxVehiculos: 5 } })
  listVehicles.mockResolvedValue([{ id: 'x' }])
  getUser.mockResolvedValue({ email: 'jefe@uno.cl' })
})

describe('POST aceptar', () => {
  it('401 sin sesión', async () => {
    getMembership.mockResolvedValue(null)
    expect((await POST(sinBody(), ctx('tok'))).status).toBe(401)
  })

  it('404 si el token no existe', async () => {
    getTransferenciaByToken.mockResolvedValue(null)
    expect((await POST(sinBody(), ctx('tok'))).status).toBe(404)
  })

  it('403 si el correo de la sesión no es el destinatario', async () => {
    getMembership.mockResolvedValue({ uid: 'u9', email: 'colado@x.cl', companyId: 'c9', role: 'admin' })
    const res = await POST(sinBody(), ctx('tok'))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('otro_destinatario')
    expect(transferirVehiculo).not.toHaveBeenCalled()
  })

  it('410 si venció', async () => {
    getTransferenciaByToken.mockResolvedValue({
      id: 't1', vehicleId: 'v1', patente: 'ABCD-12', deCompanyId: 'c1',
      paraEmail: 'nuevo@dos.cl', status: 'pendiente', expiresAt: '2000-01-01T00:00:00.000Z', creadaPorUid: 'u1',
    })
    expect((await POST(sinBody(), ctx('tok'))).status).toBe(410)
  })

  it('409 plan_limit si el plan del destinatario está lleno', async () => {
    listVehicles.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }])
    const res = await POST(sinBody(), ctx('tok'))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('plan_limit')
  })

  it('200: transfiere, marca aceptada y avisa al emisor', async () => {
    const res = await POST(sinBody(), ctx('tok'))
    expect(res.status).toBe(200)
    expect(transferirVehiculo).toHaveBeenCalledWith('v1', 'c1', 'c2')
    expect(markAceptada).toHaveBeenCalledWith('t1', 'u2')
    expect(sendAceptada).toHaveBeenCalledWith('jefe@uno.cl', { patente: 'ABCD-12', paraEmail: 'nuevo@dos.cl' })
  })

  it('409 ya_transferido si el vehículo cambió de dueño entremedio', async () => {
    transferirVehiculo.mockRejectedValue(new Error('ya_transferido'))
    const res = await POST(sinBody(), ctx('tok'))
    expect(res.status).toBe(409)
    expect(markAceptada).not.toHaveBeenCalled()
  })

  it('500 ante un error desconocido, sin marcarla aceptada', async () => {
    transferirVehiculo.mockRejectedValue(new Error('boom'))
    expect((await POST(sinBody(), ctx('tok'))).status).toBe(500)
    expect(markAceptada).not.toHaveBeenCalled()
  })
})
