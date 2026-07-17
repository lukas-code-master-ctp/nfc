import { describe, it, expect, vi, beforeEach } from 'vitest'

const docGet = vi.fn()
const docUpdate = vi.fn()
const bucketDelete = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ get: docGet, update: docUpdate }) }) },
  adminBucket: { file: (p: string) => ({ delete: (...a: unknown[]) => bucketDelete(p, ...a) }) },
}))

import { setDanoActivo, clearDanoActivo } from '@/lib/data/vehicles'

const dano = { nota: 'x', fotoPath: 'vehicles/v1/dano/nuevo', reportadoPor: 'admin' as const, reportadoPorNombre: null, reportadoEn: '2026-07-09T12:00:00Z' }

beforeEach(() => { docGet.mockReset(); docUpdate.mockReset(); bucketDelete.mockReset() })

describe('setDanoActivo', () => {
  it('valida companyId y escribe danoActivo', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1' }) })
    await setDanoActivo('v1', 'c1', dano)
    expect(docUpdate).toHaveBeenCalledWith({ danoActivo: dano })
  })
  it('borra la foto anterior si se reemplaza por otra', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1', danoActivo: { fotoPath: 'vehicles/v1/dano/vieja' } }) })
    await setDanoActivo('v1', 'c1', dano)
    expect(bucketDelete).toHaveBeenCalledWith('vehicles/v1/dano/vieja', { ignoreNotFound: true })
  })
  it('lanza forbidden si es de otra empresa', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'otra' }) })
    await expect(setDanoActivo('v1', 'c1', dano)).rejects.toThrow('forbidden')
  })
})

describe('clearDanoActivo', () => {
  it('borra la foto y setea null', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1', danoActivo: { fotoPath: 'vehicles/v1/dano/x' } }) })
    await clearDanoActivo('v1', 'c1')
    expect(bucketDelete).toHaveBeenCalledWith('vehicles/v1/dano/x', { ignoreNotFound: true })
    expect(docUpdate).toHaveBeenCalledWith({ danoActivo: null })
  })
})
