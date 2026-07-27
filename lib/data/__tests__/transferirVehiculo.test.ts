import { describe, it, expect, vi, beforeEach } from 'vitest'

const getVehicle = vi.fn()
const getOpenUsage = vi.fn()
const forzarCierreUsage = vi.fn()
vi.mock('@/lib/data/vehicles', () => ({ getVehicle: (...a: unknown[]) => getVehicle(...a) }))
vi.mock('@/lib/data/usages', () => ({
  getOpenUsage: (...a: unknown[]) => getOpenUsage(...a),
  forzarCierreUsage: (...a: unknown[]) => forzarCierreUsage(...a),
}))

const batchUpdate = vi.fn()
const batchCommit = vi.fn()
const deleteFile = vi.fn()
const colGet = vi.fn()

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({ _col: name, _id: id }),
      where: () => ({ get: () => colGet(name) }),
    }),
    batch: () => ({ update: batchUpdate, commit: batchCommit }),
  },
  adminBucket: { file: () => ({ delete: deleteFile }) },
}))

import { transferirVehiculo } from '@/lib/data/transferirVehiculo'

beforeEach(() => {
  batchUpdate.mockReset(); batchCommit.mockReset()
  deleteFile.mockReset(); colGet.mockReset(); getVehicle.mockReset()
  getOpenUsage.mockReset(); forzarCierreUsage.mockReset()

  getVehicle.mockResolvedValue({ id: 'v1', companyId: 'c1', patente: 'ABCD-12' })
  getOpenUsage.mockResolvedValue(null)
  colGet.mockImplementation((name: string) => {
    if (name === 'documents') return Promise.resolve({ docs: [{ ref: { _id: 'd1' } }, { ref: { _id: 'd2' } }] })
    if (name === 'mantenciones') return Promise.resolve({ docs: [{ ref: { _id: 'm1' } }] })
    return Promise.resolve({ docs: [] }) // alertas
  })
})

describe('transferirVehiculo', () => {
  it('corta si el vehículo ya no es de la empresa que transfiere', async () => {
    getVehicle.mockResolvedValue({ id: 'v1', companyId: 'otra' })
    await expect(transferirVehiculo('v1', 'c1', 'c2')).rejects.toThrow('ya_transferido')
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it('corta si el vehículo ya no existe', async () => {
    getVehicle.mockResolvedValue(null)
    await expect(transferirVehiculo('v1', 'c1', 'c2')).rejects.toThrow('ya_transferido')
  })

  it('mueve el vehículo limpiando categoría y daño activo', async () => {
    await transferirVehiculo('v1', 'c1', 'c2')
    expect(batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _col: 'vehicles', _id: 'v1' }),
      { companyId: 'c2', categoriaId: null, danoActivo: null },
    )
  })

  it('mueve documentos y mantenciones, y confirma el batch', async () => {
    await transferirVehiculo('v1', 'c1', 'c2')
    expect(batchUpdate).toHaveBeenCalledWith({ _id: 'd1' }, { companyId: 'c2' })
    expect(batchUpdate).toHaveBeenCalledWith({ _id: 'd2' }, { companyId: 'c2' })
    expect(batchUpdate).toHaveBeenCalledWith({ _id: 'm1' }, { companyId: 'c2' })
    expect(batchCommit).toHaveBeenCalledTimes(1)
  })

  it('no toca publicToken ni kmActual', async () => {
    await transferirVehiculo('v1', 'c1', 'c2')
    const patchVehiculo = batchUpdate.mock.calls.find((c) => c[0]?._col === 'vehicles')?.[1]
    expect(patchVehiculo).not.toHaveProperty('publicToken')
    expect(patchVehiculo).not.toHaveProperty('kmActual')
  })

  it('cierra el uso abierto antes de mover', async () => {
    getOpenUsage.mockResolvedValue({ id: 'u9' })
    await transferirVehiculo('v1', 'c1', 'c2')
    expect(forzarCierreUsage).toHaveBeenCalledWith('c1', 'u9')
  })

  it('sigue adelante si el cierre forzado falla', async () => {
    getOpenUsage.mockResolvedValue({ id: 'u9' })
    forzarCierreUsage.mockRejectedValue(new Error('no_abierto'))
    await expect(transferirVehiculo('v1', 'c1', 'c2')).resolves.toBeUndefined()
    expect(batchCommit).toHaveBeenCalled()
  })

  it('borra la foto del daño activo', async () => {
    getVehicle.mockResolvedValue({
      id: 'v1', companyId: 'c1', danoActivo: { fotoPath: 'vehicles/v1/dano/x' },
    })
    await transferirVehiculo('v1', 'c1', 'c2')
    expect(deleteFile).toHaveBeenCalledWith({ ignoreNotFound: true })
  })
})
