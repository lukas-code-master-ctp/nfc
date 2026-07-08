import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMembership = vi.fn()
vi.mock('@/lib/auth/membership', () => ({ getMembership: () => getMembership() }))
const saveCompany = vi.fn()
vi.mock('@/lib/data/companies', () => ({ saveCompany: (...a: unknown[]) => saveCompany(...a) }))

import { PATCH } from '@/app/api/company/route'
function req(body: unknown) { return { json: () => Promise.resolve(body) } as unknown as import('next/server').NextRequest }

beforeEach(() => {
  getMembership.mockReset(); saveCompany.mockReset()
  getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
})

describe('PATCH /api/company categorias', () => {
  it('403 si no es admin', async () => {
    getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'viewer' })
    expect((await PATCH(req({ categorias: [] }))).status).toBe(403)
  })
  it('guarda categorías saneadas sin company', async () => {
    const res = await PATCH(req({ categorias: [{ id: 'a', nombre: '  Camiones  ' }, { nombre: '' }] }))
    expect(res.status).toBe(200)
    expect(saveCompany).toHaveBeenCalledWith('c1', { categorias: [{ id: 'a', nombre: 'Camiones' }] })
  })
  it('400 si el body no trae nada que actualizar', async () => {
    expect((await PATCH(req({}))).status).toBe(400)
  })
})
