import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const getMembership = vi.fn()
const getVehicle = vi.fn()
const getCompany = vi.fn()
const createTransferencia = vi.fn()
const getPendienteByVehicle = vi.fn()
const cancelTransferencia = vi.fn()
const getUserByEmail = vi.fn()
const userDocGet = vi.fn()
const sendRecibida = vi.fn()
const sendSinCuenta = vi.fn()

vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))
vi.mock('@/lib/data/vehicles', () => ({ getVehicle: (...a: unknown[]) => getVehicle(...a) }))
vi.mock('@/lib/data/companies', () => ({ getCompany: (...a: unknown[]) => getCompany(...a) }))
vi.mock('@/lib/data/transferencias', () => ({
  createTransferencia: (...a: unknown[]) => createTransferencia(...a),
  getPendienteByVehicle: (...a: unknown[]) => getPendienteByVehicle(...a),
  cancelTransferencia: (...a: unknown[]) => cancelTransferencia(...a),
}))
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { getUserByEmail: (...a: unknown[]) => getUserByEmail(...a) },
  adminDb: { collection: () => ({ doc: () => ({ get: () => userDocGet() }) }) },
}))
vi.mock('@/lib/email/resend', () => ({
  sendTransferenciaRecibidaEmail: (...a: unknown[]) => sendRecibida(...a),
  sendTransferenciaEnviadaEmail: () => Promise.resolve(),
  sendTransferenciaSinCuentaEmail: (...a: unknown[]) => sendSinCuenta(...a),
}))

import { POST, DELETE } from '@/app/api/vehicles/[id]/transferir/route'

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as unknown as NextRequest
const sinBody = () => ({}) as NextRequest

beforeEach(() => {
  getMembership.mockReset(); getVehicle.mockReset(); getCompany.mockReset()
  createTransferencia.mockReset(); getPendienteByVehicle.mockReset(); cancelTransferencia.mockReset()
  getUserByEmail.mockReset(); userDocGet.mockReset()
  sendRecibida.mockReset(); sendSinCuenta.mockReset()

  getMembership.mockResolvedValue({ uid: 'u1', email: 'jefe@uno.cl', companyId: 'c1', role: 'admin' })
  getVehicle.mockResolvedValue({ id: 'v1', companyId: 'c1', patente: 'ABCD-12' })
  getCompany.mockResolvedValue({ company: { razonSocial: 'Uno' } })
  getPendienteByVehicle.mockResolvedValue(null)
  getUserByEmail.mockResolvedValue({ uid: 'u2' })
  userDocGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c2' }) })
  createTransferencia.mockResolvedValue({ id: 't1', token: 'tok' })
})

describe('POST transferir', () => {
  it('401 sin sesión', async () => {
    getMembership.mockResolvedValue(null)
    expect((await POST(req({ email: 'a@b.cl' }), ctx('v1'))).status).toBe(401)
  })

  it('403 si el rol no gestiona vehículos', async () => {
    getMembership.mockResolvedValue({ uid: 'u1', email: 'e@e.cl', companyId: 'c1', role: 'editor' })
    expect((await POST(req({ email: 'a@b.cl' }), ctx('v1'))).status).toBe(403)
  })

  it('403 si el vehículo es de otra empresa', async () => {
    getVehicle.mockResolvedValue({ id: 'v1', companyId: 'otra' })
    expect((await POST(req({ email: 'a@b.cl' }), ctx('v1'))).status).toBe(403)
  })

  it('400 si el correo es inválido', async () => {
    expect((await POST(req({ email: 'no-es-correo' }), ctx('v1'))).status).toBe(400)
  })

  it('crea la transferencia aunque el correo no tenga cuenta', async () => {
    getUserByEmail.mockRejectedValue(new Error('user not found'))
    const res = await POST(req({ email: 'nadie@x.cl' }), ctx('v1'))
    expect(res.status).toBe(200)
    expect(createTransferencia).toHaveBeenCalledWith(expect.objectContaining({ paraEmail: 'nadie@x.cl' }))
  })

  it('crea la transferencia si el usuario existe pero no tiene empresa', async () => {
    userDocGet.mockResolvedValue({ exists: true, data: () => ({}) })
    expect((await POST(req({ email: 'a@b.cl' }), ctx('v1'))).status).toBe(200)
  })

  it('usa la plantilla de registro cuando el correo no tiene cuenta', async () => {
    getUserByEmail.mockRejectedValue(new Error('user not found'))
    await POST(req({ email: 'nadie@x.cl' }), ctx('v1'))
    expect(sendSinCuenta).toHaveBeenCalledWith('nadie@x.cl', expect.objectContaining({
      patente: 'ABCD-12', paraEmail: 'nadie@x.cl',
    }))
    expect(sendRecibida).not.toHaveBeenCalled()
  })

  it('usa la plantilla normal cuando el correo sí tiene cuenta', async () => {
    await POST(req({ email: 'nuevo@dos.cl' }), ctx('v1'))
    expect(sendRecibida).toHaveBeenCalled()
    expect(sendSinCuenta).not.toHaveBeenCalled()
  })

  it('400 misma_empresa si el correo es de la misma empresa', async () => {
    userDocGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1' }) })
    const res = await POST(req({ email: 'colega@uno.cl' }), ctx('v1'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('misma_empresa')
  })

  it('409 ya_pendiente si ya hay una en curso', async () => {
    getPendienteByVehicle.mockResolvedValue({ id: 't0' })
    const res = await POST(req({ email: 'a@b.cl' }), ctx('v1'))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('ya_pendiente')
  })

  it('200 y crea la transferencia con el correo normalizado', async () => {
    const res = await POST(req({ email: '  Nuevo@Dos.CL ' }), ctx('v1'))
    expect(res.status).toBe(200)
    expect(createTransferencia).toHaveBeenCalledWith(expect.objectContaining({
      vehicleId: 'v1', patente: 'ABCD-12', deCompanyId: 'c1', paraEmail: 'nuevo@dos.cl', creadaPorUid: 'u1',
    }))
  })
})

describe('DELETE transferir', () => {
  it('404 si no hay pendiente', async () => {
    expect((await DELETE(sinBody(), ctx('v1'))).status).toBe(404)
  })

  it('404 si la pendiente es de otra empresa', async () => {
    getPendienteByVehicle.mockResolvedValue({ id: 't1', deCompanyId: 'otra' })
    expect((await DELETE(sinBody(), ctx('v1'))).status).toBe(404)
  })

  it('200 y cancela', async () => {
    getPendienteByVehicle.mockResolvedValue({ id: 't1', deCompanyId: 'c1' })
    expect((await DELETE(sinBody(), ctx('v1'))).status).toBe(200)
    expect(cancelTransferencia).toHaveBeenCalledWith('t1', 'c1')
  })
})
