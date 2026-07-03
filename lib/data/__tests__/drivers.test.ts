import { describe, it, expect, vi, beforeEach } from 'vitest'

const whereGet = vi.fn()
const docGet = vi.fn()
const docUpdate = vi.fn()
const add = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      where: () => ({ get: whereGet }),
      doc: () => ({ get: docGet, update: docUpdate }),
      add,
    }),
  },
}))

import { listActiveDrivers, verifyDriverPin, createDriver } from '@/lib/data/drivers'
import { hashPin } from '@/lib/drivers/pin'

beforeEach(() => {
  whereGet.mockReset(); docGet.mockReset(); docUpdate.mockReset(); add.mockReset()
})

describe('createDriver', () => {
  it('hashea el PIN (no lo guarda plano)', async () => {
    add.mockResolvedValue({ id: 'd1' })
    await createDriver('c1', 'u1', { nombre: 'Ana', pin: '1234' })
    const saved = add.mock.calls[0][0]
    expect(saved.pinHash).not.toContain('1234')
    expect(saved.companyId).toBe('c1')
    expect(saved.activo).toBe(true)
  })
})

describe('listActiveDrivers', () => {
  it('filtra inactivos y devuelve solo id + nombre', async () => {
    whereGet.mockResolvedValue({
      docs: [
        { id: 'd1', data: () => ({ nombre: 'Ana', activo: true, pinHash: 'x' }) },
        { id: 'd2', data: () => ({ nombre: 'Beto', activo: false, pinHash: 'y' }) },
      ],
    })
    expect(await listActiveDrivers('c1')).toEqual([{ id: 'd1', nombre: 'Ana' }])
  })
})

describe('verifyDriverPin', () => {
  it('ok con PIN correcto y resetea intentos', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1', activo: true, pinHash: hashPin('1234'), intentosFallidos: 2 }) })
    expect(await verifyDriverPin('c1', 'd1', '1234')).toBe('ok')
    expect(docUpdate).toHaveBeenCalledWith({ intentosFallidos: 0, bloqueadoHasta: null })
  })
  it('bad_pin con PIN incorrecto y suma intento', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1', activo: true, pinHash: hashPin('1234'), intentosFallidos: 0 }) })
    expect(await verifyDriverPin('c1', 'd1', '9999')).toBe('bad_pin')
    expect(docUpdate).toHaveBeenCalled()
  })
  it('bad_pin si el conductor es de otra empresa', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'otra', activo: true, pinHash: hashPin('1234') }) })
    expect(await verifyDriverPin('c1', 'd1', '1234')).toBe('bad_pin')
  })
  it('locked si está bloqueado', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1', activo: true, pinHash: hashPin('1234'), bloqueadoHasta: new Date(Date.now() + 60000).toISOString() }) })
    expect(await verifyDriverPin('c1', 'd1', '1234')).toBe('locked')
  })
})
