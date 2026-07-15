import { describe, it, expect, vi, beforeEach } from 'vitest'

const whereGet = vi.fn()
const add = vi.fn()
const docGet = vi.fn()
const docDelete = vi.fn()
const vehicleUpdate = vi.fn()
const bucketDelete = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (col: string) => ({
      where: () => ({ get: whereGet }),
      add,
      doc: () => (col === 'vehicles'
        ? { update: vehicleUpdate }
        : { get: docGet, delete: docDelete }),
    }),
  },
  adminBucket: { file: (p: string) => ({ delete: (...a: unknown[]) => bucketDelete(p, ...a) }) },
}))

import {
  createMantencion, ultimaMantencion,
  deleteMantencion, deleteMantencionesByVehicle,
} from '@/lib/data/mantenciones'

beforeEach(() => {
  whereGet.mockReset(); add.mockReset(); docGet.mockReset()
  docDelete.mockReset(); vehicleUpdate.mockReset(); bucketDelete.mockReset()
  add.mockResolvedValue({ id: 'm1' })
})

describe('createMantencion', () => {
  it('crea el registro y resetea los hitos de email del vehículo', async () => {
    const r = await createMantencion('c1', 'u1', { vehicleId: 'v1', fecha: '2026-07-01', km: 12000, nota: 'aceite', filePath: 'p/f', fileUrl: 'p/f' })
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'c1', vehicleId: 'v1', km: 12000, createdByUid: 'u1' }))
    expect(vehicleUpdate).toHaveBeenCalledWith({ mantencionReminders: [] })
    expect(r.id).toBe('m1')
  })
})

describe('ultimaMantencion', () => {
  it('devuelve la más reciente por fecha', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'a', data: () => ({ vehicleId: 'v1', fecha: '2026-01-01', km: 1000 }) },
      { id: 'b', data: () => ({ vehicleId: 'v1', fecha: '2026-06-01', km: 9000 }) },
    ] })
    expect(await ultimaMantencion('v1')).toEqual({ km: 9000, fecha: '2026-06-01' })
  })
  it('null si no hay', async () => {
    whereGet.mockResolvedValue({ docs: [] })
    expect(await ultimaMantencion('v1')).toBeNull()
  })
})

describe('deleteMantencion', () => {
  it('borra el archivo de Storage y el doc', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1', filePath: 'p/f' }) })
    await deleteMantencion('m1', 'c1')
    expect(bucketDelete).toHaveBeenCalledWith('p/f', { ignoreNotFound: true })
    expect(docDelete).toHaveBeenCalled()
  })
  it('lanza forbidden si es de otra empresa', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'otra' }) })
    await expect(deleteMantencion('m1', 'c1')).rejects.toThrow('forbidden')
  })
})

describe('deleteMantencionesByVehicle', () => {
  it('borra archivos + docs de todas las mantenciones del vehículo', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'a', data: () => ({ vehicleId: 'v1', filePath: 'p/a' }), ref: { delete: docDelete } },
      { id: 'b', data: () => ({ vehicleId: 'v1', filePath: null }), ref: { delete: docDelete } },
    ] })
    await deleteMantencionesByVehicle('v1')
    expect(bucketDelete).toHaveBeenCalledWith('p/a', { ignoreNotFound: true })
    expect(docDelete).toHaveBeenCalledTimes(2)
  })
})
