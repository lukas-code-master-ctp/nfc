import { describe, it, expect, vi, beforeEach } from 'vitest'

const whereGet = vi.fn()
const add = vi.fn()
const docUpdate = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      where: () => ({ get: whereGet }),
      add,
      doc: () => ({ update: docUpdate }),
    }),
  },
}))

import { openUsage, closeUsage, getOpenUsage, listUsages } from '@/lib/data/usages'

beforeEach(() => { whereGet.mockReset(); add.mockReset(); docUpdate.mockReset() })

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
