import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const update = vi.fn().mockResolvedValue(undefined)
  const doc = vi.fn(() => ({ update }))
  const get = vi.fn()
  const where = vi.fn(() => ({ get }))
  const collection = vi.fn(() => ({ doc, where, get }))
  return { update, doc, get, where, collection }
})

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mocks.collection },
  adminBucket: { file: vi.fn(() => ({ delete: vi.fn() })) },
}))

const { refreshResumenDocs } = await import('@/lib/data/documents')
const { refreshResumenMantencion } = await import('@/lib/data/mantenciones')

function snapshot(docs: Record<string, unknown>[]) {
  return { docs: docs.map((d, i) => ({ id: `d${i}`, data: () => d })) }
}

beforeEach(() => {
  mocks.update.mockClear().mockResolvedValue(undefined)
  mocks.doc.mockClear()
  mocks.get.mockReset()
  mocks.collection.mockClear()
})

describe('refreshResumenDocs', () => {
  it('escribe el total y la fecha más próxima', async () => {
    mocks.get.mockResolvedValue(snapshot([
      { vehicleId: 'v1', fechaVencimiento: '2027-01-15' },
      { vehicleId: 'v1', fechaVencimiento: '2026-08-10' },
      { vehicleId: 'v1', fechaVencimiento: null },
    ]))
    await refreshResumenDocs('v1')
    expect(mocks.doc).toHaveBeenCalledWith('v1')
    expect(mocks.update).toHaveBeenCalledWith({
      resumenDocs: { total: 3, proximoVencimiento: '2026-08-10' },
    })
  })

  it('un vehículo sin documentos queda en total 0', async () => {
    mocks.get.mockResolvedValue(snapshot([]))
    await refreshResumenDocs('v1')
    expect(mocks.update).toHaveBeenCalledWith({
      resumenDocs: { total: 0, proximoVencimiento: null },
    })
  })

  it('si Firestore falla no propaga: la escritura ya guardada no se pierde', async () => {
    mocks.get.mockRejectedValue(new Error('firestore caido'))
    await expect(refreshResumenDocs('v1')).resolves.toBeUndefined()
  })
})

describe('refreshResumenMantencion', () => {
  it('guarda la última mantención envuelta', async () => {
    mocks.get.mockResolvedValue(snapshot([
      { vehicleId: 'v1', fecha: '2026-05-01', km: 30000, companyId: 'c1', createdAt: '2026-05-01' },
    ]))
    await refreshResumenMantencion('v1')
    expect(mocks.update).toHaveBeenCalledWith({
      resumenMantencion: { ultima: { km: 30000, fecha: '2026-05-01' } },
    })
  })

  it('ante empate de fecha, desempata por id mayor (determinista)', async () => {
    // Mismo día, dos registros distintos (ej. "cambio de aceite" y
    // "neumáticos" cargados por separado). snapshot() asigna ids d0, d1, ...
    // en orden de aparición, así que el segundo elemento es 'd1' > 'd0'.
    mocks.get.mockResolvedValue(snapshot([
      { vehicleId: 'v1', fecha: '2026-05-01', km: 30000, companyId: 'c1', createdAt: '2026-05-01' },
      { vehicleId: 'v1', fecha: '2026-05-01', km: 31500, companyId: 'c1', createdAt: '2026-05-01' },
    ]))
    await refreshResumenMantencion('v1')
    expect(mocks.update).toHaveBeenCalledWith({
      resumenMantencion: { ultima: { km: 31500, fecha: '2026-05-01' } },
    })
  })

  it('sin mantenciones guarda ultima: null, que NO es lo mismo que no haber calculado', async () => {
    mocks.get.mockResolvedValue(snapshot([]))
    await refreshResumenMantencion('v1')
    expect(mocks.update).toHaveBeenCalledWith({ resumenMantencion: { ultima: null } })
  })

  it('si Firestore falla no propaga', async () => {
    mocks.get.mockRejectedValue(new Error('firestore caido'))
    await expect(refreshResumenMantencion('v1')).resolves.toBeUndefined()
  })
})
