import { describe, it, expect, vi, beforeEach } from 'vitest'

const docGet = vi.fn()
const docUpdate = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ get: docGet, update: docUpdate }) }) },
}))

import { getUsage, setUsageAnalysis, updateUsageDatos } from '@/lib/data/usages'

beforeEach(() => { docGet.mockReset(); docUpdate.mockReset() })

describe('getUsage', () => {
  it('devuelve el uso o null', async () => {
    docGet.mockResolvedValue({ exists: true, id: 'u1', data: () => ({ vehicleId: 'v1', estado: 'cerrado', tomadoEn: 't' }) })
    expect((await getUsage('u1'))?.id).toBe('u1')
    docGet.mockResolvedValue({ exists: false })
    expect(await getUsage('nope')).toBeNull()
  })
})

describe('setUsageAnalysis', () => {
  it('escribe los 3 campos + iaAnalizadoEn (sin confirmar)', async () => {
    await setUsageAnalysis('u1', { bencina: '1/2', km: 100, limpieza: 'limpio' })
    const arg = docUpdate.mock.calls[0][0]
    expect(arg).toMatchObject({ bencina: '1/2', km: 100, limpieza: 'limpio' })
    expect(typeof arg.iaAnalizadoEn).toBe('string')
    expect(arg.datosConfirmados).toBeUndefined()
  })
})

describe('updateUsageDatos', () => {
  it('rechaza si el uso es de otra empresa', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'otra' }) })
    await expect(updateUsageDatos('c1', 'u1', { km: 200 })).rejects.toThrow('forbidden')
  })
  it('actualiza y marca confirmado si pertenece', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1' }) })
    await updateUsageDatos('c1', 'u1', { km: 200 })
    expect(docUpdate).toHaveBeenCalledWith({ km: 200, datosConfirmados: true })
  })
})
