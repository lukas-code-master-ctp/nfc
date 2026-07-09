import { describe, it, expect, vi, beforeEach } from 'vitest'

const whereGet = vi.fn()
const add = vi.fn()
const docUpdate = vi.fn()
const docGet = vi.fn()
const docDelete = vi.fn()
const bucketDelete = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      where: () => ({ get: whereGet }),
      add,
      doc: () => ({ get: docGet, update: docUpdate, delete: docDelete }),
    }),
  },
  adminBucket: { file: (p: string) => ({ delete: (...a: unknown[]) => bucketDelete(p, ...a) }) },
}))

import { openUsage, closeUsage, getOpenUsage, listUsages, marcarDanoRevisado, forzarCierreUsage, usagePhotoPaths, deleteUsagesByVehicle, deleteUsagesByCompany } from '@/lib/data/usages'

beforeEach(() => { whereGet.mockReset(); add.mockReset(); docUpdate.mockReset(); docGet.mockReset(); docDelete.mockReset(); bucketDelete.mockReset() })

describe('forzarCierreUsage', () => {
  it('cierra forzado, libera el vehículo y devuelve el driverId', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1', estado: 'abierto', vehicleId: 'v1', driverId: 'd1' }) })
    const r = await forzarCierreUsage('c1', 'u1')
    expect(docUpdate).toHaveBeenCalledWith({ estado: 'cerrado', cierreForzado: true })
    expect(docUpdate).toHaveBeenCalledWith({ usoActual: null })
    expect(r).toEqual({ driverId: 'd1' })
  })
  it('lanza forbidden si el uso es de otra empresa', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'otra', estado: 'abierto', vehicleId: 'v1', driverId: 'd1' }) })
    await expect(forzarCierreUsage('c1', 'u1')).rejects.toThrow('forbidden')
  })
  it('lanza no_abierto si el uso ya está cerrado', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1', estado: 'cerrado', vehicleId: 'v1', driverId: 'd1' }) })
    await expect(forzarCierreUsage('c1', 'u1')).rejects.toThrow('no_abierto')
  })
})

describe('getOpenUsage', () => {
  it('devuelve el uso abierto (filtra cerrados en memoria)', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'u1', data: () => ({ vehicleId: 'v1', estado: 'cerrado', tomadoEn: '2026-01-01' }) },
      { id: 'u2', data: () => ({ vehicleId: 'v1', estado: 'abierto', tomadoEn: '2026-02-01' }) },
    ] })
    expect((await getOpenUsage('v1'))?.id).toBe('u2')
  })
})

describe('openUsage', () => {
  it('sin uso abierto: solo crea uno nuevo', async () => {
    whereGet.mockResolvedValue({ docs: [] })
    add.mockResolvedValue({ id: 'nuevo' })
    const r = await openUsage('c1', 'v1', { id: 'd1', nombre: 'Ana' })
    expect(r.forced).toBeNull()
    expect(r.usage.id).toBe('nuevo')
    expect(add.mock.calls[0][0]).toMatchObject({ estado: 'abierto', driverId: 'd1', companyId: 'c1' })
  })
  it('con uso abierto: lo cierra como forzado y crea el nuevo', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'viejo', data: () => ({ vehicleId: 'v1', estado: 'abierto', tomadoEn: '2026-01-01', companyId: 'c1' }) },
    ] })
    add.mockResolvedValue({ id: 'nuevo' })
    const r = await openUsage('c1', 'v1', { id: 'd2', nombre: 'Beto' })
    expect(r.forced?.id).toBe('viejo')
    expect(docUpdate).toHaveBeenCalledWith({ estado: 'cerrado', cierreForzado: true })
  })
})

describe('closeUsage', () => {
  it('lanza no_open si no hay uso abierto', async () => {
    whereGet.mockResolvedValue({ docs: [] })
    await expect(
      closeUsage('c1', 'v1', { id: 'd1', nombre: 'Ana' }, { tablero: 'a', cabina: 'b' }),
    ).rejects.toThrow('no_open')
  })
  it('cierra el uso abierto con fotos', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'u1', data: () => ({ vehicleId: 'v1', estado: 'abierto', companyId: 'c1', tomadoEn: '2026-01-01' }) },
    ] })
    await closeUsage('c1', 'v1', { id: 'd1', nombre: 'Ana' }, { tablero: 'a', cabina: 'b' })
    expect(docUpdate).toHaveBeenCalledWith(expect.objectContaining({
      estado: 'cerrado', entregadoPorDriverId: 'd1', fotos: { tablero: 'a', cabina: 'b' },
    }))
  })
  it('marca entregaIrregular cuando entrega otro conductor', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'u1', data: () => ({ vehicleId: 'v1', estado: 'abierto', companyId: 'c1', driverId: 'd1', driverNombre: 'Ana', tomadoEn: '2026-01-01' }) },
    ] })
    const r = await closeUsage('c1', 'v1', { id: 'd2', nombre: 'Beto' }, { tablero: 'a', cabina: 'b' })
    expect(r).toEqual({ id: 'u1', entregaIrregular: true, driverOriginal: { id: 'd1', nombre: 'Ana' }, tomadoEn: '2026-01-01' })
  })
  it('entregaIrregular es falso cuando entrega el mismo conductor', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'u1', data: () => ({ vehicleId: 'v1', estado: 'abierto', companyId: 'c1', driverId: 'd1', driverNombre: 'Ana', tomadoEn: '2026-01-01' }) },
    ] })
    const r = await closeUsage('c1', 'v1', { id: 'd1', nombre: 'Ana' }, { tablero: 'a', cabina: 'b' })
    expect(r.entregaIrregular).toBe(false)
  })
})

describe('listUsages', () => {
  it('ordena desc por tomadoEn', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'a', data: () => ({ tomadoEn: '2026-01-01' }) },
      { id: 'b', data: () => ({ tomadoEn: '2026-03-01' }) },
    ] })
    expect((await listUsages('v1')).map((u) => u.id)).toEqual(['b', 'a'])
  })
})

describe('usagePhotoPaths', () => {
  it('reúne tablero, cabina y foto de daño; omite las que faltan', () => {
    expect(usagePhotoPaths({ fotos: { tablero: 't', cabina: 'c' }, dano: { hay: true, fotoPath: 'd' } } as never)).toEqual(['t', 'c', 'd'])
    expect(usagePhotoPaths({ fotos: { tablero: 't' } } as never)).toEqual(['t'])
    expect(usagePhotoPaths({} as never)).toEqual([])
  })
})

describe('deleteUsagesByVehicle', () => {
  it('borra las fotos de Storage de cada uso y luego sus docs', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'u1', data: () => ({ vehicleId: 'v1', tomadoEn: '2026-01-02', fotos: { tablero: 'p/t1', cabina: 'p/c1' }, dano: { hay: true, fotoPath: 'p/d1' } }) },
      { id: 'u2', data: () => ({ vehicleId: 'v1', tomadoEn: '2026-01-01' }) },
    ] })
    await deleteUsagesByVehicle('v1')
    expect(bucketDelete).toHaveBeenCalledWith('p/t1', { ignoreNotFound: true })
    expect(bucketDelete).toHaveBeenCalledWith('p/c1', { ignoreNotFound: true })
    expect(bucketDelete).toHaveBeenCalledWith('p/d1', { ignoreNotFound: true })
    expect(bucketDelete).toHaveBeenCalledTimes(3) // u2 no tiene fotos
    expect(docDelete).toHaveBeenCalledTimes(2)
  })
})

describe('deleteUsagesByCompany', () => {
  it('borra fotos + docs de todos los usos de la empresa', async () => {
    whereGet.mockResolvedValue({ docs: [
      { id: 'u1', data: () => ({ companyId: 'c1', tomadoEn: '2026-01-01', fotos: { tablero: 'p/t1', cabina: 'p/c1' } }) },
    ] })
    await deleteUsagesByCompany('c1')
    expect(bucketDelete).toHaveBeenCalledWith('p/t1', { ignoreNotFound: true })
    expect(bucketDelete).toHaveBeenCalledWith('p/c1', { ignoreNotFound: true })
    expect(docDelete).toHaveBeenCalledTimes(1)
  })
})

describe('marcarDanoRevisado', () => {
  it('estampa la revisión en un uso con daño no revisado', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1', dano: { hay: true, nota: 'x' } }) })
    await marcarDanoRevisado('c1', 'u1', { uid: 'r1', nombre: 'Ana' })
    expect(docUpdate).toHaveBeenCalledWith(expect.objectContaining({
      'dano.revisadoPorUid': 'r1', 'dano.revisadoPorNombre': 'Ana',
    }))
  })
  it('lanza forbidden si el uso no es de la empresa', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'otra', dano: { hay: true } }) })
    await expect(marcarDanoRevisado('c1', 'u1', { uid: 'r1', nombre: 'Ana' })).rejects.toThrow('forbidden')
  })
  it('lanza no_dano si el uso no tiene daño', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1' }) })
    await expect(marcarDanoRevisado('c1', 'u1', { uid: 'r1', nombre: 'Ana' })).rejects.toThrow('no_dano')
  })
})
