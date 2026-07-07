import { describe, it, expect, vi, beforeEach } from 'vitest'

const whereGet = vi.fn()
const add = vi.fn()
const docGet = vi.fn()
const docDelete = vi.fn()
const refDelete = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ where: () => ({ get: whereGet }), add, doc: () => ({ get: docGet, delete: docDelete }) }) },
}))

import { createAlerta, listAlertas, deleteAlerta, deleteDanoAlertaByUsage } from '@/lib/data/alertas'

beforeEach(() => { whereGet.mockReset(); add.mockReset(); docGet.mockReset(); docDelete.mockReset(); refDelete.mockReset() })

describe('createAlerta', () => {
  it('escribe los campos + creadaEn', async () => {
    await createAlerta({ companyId: 'c1', vehicleId: 'v1', patente: 'ABCD12', usageId: 'u1', tipo: 'dano', driverNombre: 'Ana', nota: 'rayón' })
    const arg = add.mock.calls[0][0]
    expect(arg).toMatchObject({ companyId: 'c1', tipo: 'dano', patente: 'ABCD12', driverNombre: 'Ana', nota: 'rayón' })
    expect(typeof arg.creadaEn).toBe('string')
  })
})

describe('listAlertas', () => {
  it('ordena desc por creadaEn', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'a', data: () => ({ creadaEn: '2026-01-01', tipo: 'dano' }) },
      { id: 'b', data: () => ({ creadaEn: '2026-03-01', tipo: 'sin_entrega' }) },
    ] })
    expect((await listAlertas('c1')).map((a) => a.id)).toEqual(['b', 'a'])
  })
})

describe('deleteAlerta', () => {
  it('rechaza si la alerta es de otra empresa', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'otra' }) })
    await expect(deleteAlerta('c1', 'a1')).rejects.toThrow('forbidden')
  })
  it('borra si pertenece', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1' }) })
    await deleteAlerta('c1', 'a1')
    expect(docDelete).toHaveBeenCalled()
  })
})

describe('deleteDanoAlertaByUsage', () => {
  it('borra las alertas dano de ese uso', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'a1', ref: { delete: refDelete }, data: () => ({ tipo: 'dano', usageId: 'u1', companyId: 'c1' }) },
    ] })
    await deleteDanoAlertaByUsage('c1', 'u1')
    expect(refDelete).toHaveBeenCalled()
  })
})
