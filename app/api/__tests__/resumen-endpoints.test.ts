import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getMembership: vi.fn(),
  can: vi.fn(() => true),
  getVehicle: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
  refreshResumenDocs: vi.fn(),
  createMantencion: vi.fn(),
  listMantenciones: vi.fn(),
  deleteMantencion: vi.fn(),
  refreshResumenMantencion: vi.fn(),
}))

vi.mock('@/lib/auth/membership', () => ({ getMembership: mocks.getMembership }))
vi.mock('@/lib/auth/roles', () => ({ can: mocks.can }))
vi.mock('@/lib/data/vehicles', () => ({ getVehicle: mocks.getVehicle }))
vi.mock('@/lib/data/documents', () => ({
  createDocument: mocks.createDocument,
  updateDocument: mocks.updateDocument,
  deleteDocument: mocks.deleteDocument,
  refreshResumenDocs: mocks.refreshResumenDocs,
}))
vi.mock('@/lib/data/mantenciones', () => ({
  createMantencion: mocks.createMantencion,
  listMantenciones: mocks.listMantenciones,
  deleteMantencion: mocks.deleteMantencion,
  refreshResumenMantencion: mocks.refreshResumenMantencion,
}))

const docs = await import('@/app/api/documents/route')
const docsId = await import('@/app/api/documents/[id]/route')
const mants = await import('@/app/api/mantenciones/route')
const mantsId = await import('@/app/api/mantenciones/[id]/route')

function req(body: unknown): NextRequest {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest
}
const sinBody = () => ({}) as NextRequest

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.can.mockReturnValue(true)
  mocks.getMembership.mockResolvedValue({ uid: 'u1', email: 'a@b.cl', companyId: 'c1', role: 'admin' })
  mocks.getVehicle.mockResolvedValue({ id: 'v1', companyId: 'c1' })
  mocks.createDocument.mockResolvedValue({ id: 'd1', vehicleId: 'v1' })
  mocks.updateDocument.mockResolvedValue('v1')
  mocks.deleteDocument.mockResolvedValue('v1')
  mocks.createMantencion.mockResolvedValue({ id: 'm1' })
  mocks.deleteMantencion.mockResolvedValue('v1')
})

describe('refresco del resumen de documentos', () => {
  it('al crear un documento', async () => {
    await docs.POST(req({ vehicleId: 'v1', tipo: 'permiso_circulacion', fechaVencimiento: '2026-09-01' }))
    expect(mocks.refreshResumenDocs).toHaveBeenCalledWith('v1')
  })

  it('al editar un documento, porque puede cambiar la fecha de vencimiento', async () => {
    await docsId.PATCH(req({ fechaVencimiento: '2027-01-01' }), { params: Promise.resolve({ id: 'd1' }) })
    expect(mocks.refreshResumenDocs).toHaveBeenCalledWith('v1')
  })

  it('al borrar un documento', async () => {
    await docsId.DELETE(sinBody(), { params: Promise.resolve({ id: 'd1' }) })
    expect(mocks.refreshResumenDocs).toHaveBeenCalledWith('v1')
  })

  it('no refresca si la escritura fue rechazada por permisos', async () => {
    mocks.can.mockReturnValue(false)
    await docsId.DELETE(sinBody(), { params: Promise.resolve({ id: 'd1' }) })
    expect(mocks.refreshResumenDocs).not.toHaveBeenCalled()
  })

  it('descarta un vehicleId inyectado por el cliente en el PATCH', async () => {
    await docsId.PATCH(req({ fechaVencimiento: '2027-01-01', vehicleId: 'v-ajeno' }), {
      params: Promise.resolve({ id: 'd1' }),
    })
    expect(mocks.updateDocument).toHaveBeenCalled()
    const patchEnviado = mocks.updateDocument.mock.calls[0][2]
    expect(patchEnviado).not.toHaveProperty('vehicleId')
  })

  it('responde 400 cuando el PATCH solo trae campos descartados', async () => {
    const res = await docsId.PATCH(req({ vehicleId: 'v-ajeno', companyId: 'c-ajeno' }), {
      params: Promise.resolve({ id: 'd1' }),
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'nada que actualizar' })
    expect(mocks.updateDocument).not.toHaveBeenCalled()
    expect(mocks.refreshResumenDocs).not.toHaveBeenCalled()
  })
})

describe('validación de fechaVencimiento en documentos', () => {
  it('POST /api/documents responde 400 con una fecha mal formada y no crea el documento', async () => {
    const res = await docs.POST(req({ vehicleId: 'v1', tipo: 'permiso_circulacion', fechaVencimiento: '01-09-2026' }))
    expect(res.status).toBe(400)
    expect(mocks.createDocument).not.toHaveBeenCalled()
    expect(mocks.refreshResumenDocs).not.toHaveBeenCalled()
  })

  it('PATCH /api/documents/[id] responde 400 con una fecha mal formada y no actualiza', async () => {
    const res = await docsId.PATCH(req({ fechaVencimiento: '01-09-2026' }), { params: Promise.resolve({ id: 'd1' }) })
    expect(res.status).toBe(400)
    expect(mocks.updateDocument).not.toHaveBeenCalled()
    expect(mocks.refreshResumenDocs).not.toHaveBeenCalled()
  })
})

describe('refresco del resumen de mantención', () => {
  it('al registrar una mantención', async () => {
    await mants.POST(req({ vehicleId: 'v1', fecha: '2026-07-01', km: 30000 }))
    expect(mocks.refreshResumenMantencion).toHaveBeenCalledWith('v1')
  })

  it('al borrar una mantención', async () => {
    await mantsId.DELETE(sinBody(), { params: Promise.resolve({ id: 'm1' }) })
    expect(mocks.refreshResumenMantencion).toHaveBeenCalledWith('v1')
  })
})
