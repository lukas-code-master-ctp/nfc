import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/membership', () => ({ getMembership: (...a: unknown[]) => getMembership(...a) }))
const isAdminEmail = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/admin', () => ({ isAdminEmail: (...a: unknown[]) => isAdminEmail(...a) }))
const saveCompany = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/companies', () => ({ saveCompany: (...a: unknown[]) => saveCompany(...a) }))
const deleteCompanyCascade = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/deleteCompany', () => ({ deleteCompanyCascade: (...a: unknown[]) => deleteCompanyCascade(...a) }))

import { PATCH, DELETE } from '@/app/api/admin/companies/[id]/route'

function ctx(id: string) { return { params: Promise.resolve({ id }) } }
const req = {} as import('next/server').NextRequest
function patchReq(body: unknown) {
  return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest
}

beforeEach(() => {
  getMembership.mockReset(); isAdminEmail.mockReset(); deleteCompanyCascade.mockReset(); saveCompany.mockReset()
  getMembership.mockResolvedValue({ uid: 'me', email: 'admin@x.cl', companyId: 'c-admin', role: 'admin' })
  isAdminEmail.mockReturnValue(true)
  saveCompany.mockResolvedValue(undefined)
})

describe('DELETE /api/admin/companies/[id]', () => {
  it('borra la empresa vía cascade', async () => {
    const res = await DELETE(req, ctx('c9'))
    expect(res.status).toBe(200)
    expect(deleteCompanyCascade).toHaveBeenCalledWith('c9')
  })
  it('403 si no es admin de plataforma', async () => {
    isAdminEmail.mockReturnValue(false)
    expect((await DELETE(req, ctx('c9'))).status).toBe(403)
    expect(deleteCompanyCascade).not.toHaveBeenCalled()
  })
  it('401 sin sesión', async () => {
    getMembership.mockResolvedValue(null)
    expect((await DELETE(req, ctx('c9'))).status).toBe(401)
  })

  // I1: `getMembership()` devuelve null cuando la sesión está revocada (igual
  // que sin sesión) — es el punto entero del arreglo: con `getCurrentUser()`
  // (que no comprueba revocación) un admin de plataforma que pierde el
  // teléfono y cierra sesión en todos los dispositivos dejaba ese teléfono
  // pudiendo borrar empresas de clientes mientras la cookie siguiera viva.
  it('una sesión revocada no puede borrar una empresa', async () => {
    getMembership.mockResolvedValue(null)
    const res = await DELETE(req, ctx('c9'))
    expect(res.status).toBe(401)
    expect(deleteCompanyCascade).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/admin/companies/[id]', () => {
  it('actualiza el cupo del plan', async () => {
    const res = await PATCH(patchReq({ maxVehiculos: 10 }), ctx('c9'))
    expect(res.status).toBe(200)
    expect(saveCompany).toHaveBeenCalledWith('c9', { plan: { maxVehiculos: 10 } })
  })
  it('403 si no es admin de plataforma', async () => {
    isAdminEmail.mockReturnValue(false)
    expect((await PATCH(patchReq({ maxVehiculos: 10 }), ctx('c9'))).status).toBe(403)
    expect(saveCompany).not.toHaveBeenCalled()
  })
  it('401 sin sesión', async () => {
    getMembership.mockResolvedValue(null)
    expect((await PATCH(patchReq({ maxVehiculos: 10 }), ctx('c9'))).status).toBe(401)
  })

  // I1: mismo arreglo que en DELETE — este endpoint muta `plan.maxVehiculos`
  // de cualquier empresa, así que también tiene que pasar por la revocación.
  it('una sesión revocada no puede modificar el cupo de una empresa', async () => {
    getMembership.mockResolvedValue(null)
    const res = await PATCH(patchReq({ maxVehiculos: 10 }), ctx('c9'))
    expect(res.status).toBe(401)
    expect(saveCompany).not.toHaveBeenCalled()
  })
})
