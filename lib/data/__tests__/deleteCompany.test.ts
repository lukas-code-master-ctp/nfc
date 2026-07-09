import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const borrados: string[] = []
  const authBorrados: string[] = []
  const fixtures: Record<string, string[]> = {
    drivers: ['dr1'],
    alertas: [],
    invitations: ['i1'],
    billingRequests: [],
    users: ['owner', 'miembro'],
  }
  const adminDb = {
    collection: (col: string) => ({
      where: () => ({
        get: async () => ({
          docs: (fixtures[col] ?? []).map((id) => ({
            id,
            ref: { delete: async () => { borrados.push(`${col}/${id}`) } },
          })),
        }),
      }),
      doc: (id: string) => ({ delete: async () => { borrados.push(`${col}/${id}`) } }),
    }),
  }
  const adminAuth = {
    deleteUser: async (uid: string) => {
      if (uid === 'miembro') throw new Error('auth/user-not-found')
      authBorrados.push(uid)
    },
  }
  return { borrados, authBorrados, adminDb, adminAuth }
})
vi.mock('@/lib/firebase/admin', () => ({ adminDb: h.adminDb, adminAuth: h.adminAuth }))
const listVehicles = vi.hoisted(() => vi.fn())
const deleteVehicle = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/vehicles', () => ({
  listVehicles: (...a: unknown[]) => listVehicles(...a),
  deleteVehicle: (...a: unknown[]) => deleteVehicle(...a),
}))
const deleteUsagesByCompany = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/usages', () => ({
  deleteUsagesByCompany: (...a: unknown[]) => deleteUsagesByCompany(...a),
}))

import { deleteCompanyCascade } from '@/lib/data/deleteCompany'

beforeEach(() => {
  h.borrados.length = 0
  h.authBorrados.length = 0
  listVehicles.mockReset(); deleteVehicle.mockReset(); deleteUsagesByCompany.mockReset()
  listVehicles.mockResolvedValue([{ id: 'v1' }, { id: 'v2' }])
})

describe('deleteCompanyCascade', () => {
  it('borra vehículos en cascada, usos (backstop), colecciones por companyId, miembros y la empresa', async () => {
    await deleteCompanyCascade('c1')
    expect(deleteVehicle).toHaveBeenCalledWith('v1', 'c1')
    expect(deleteVehicle).toHaveBeenCalledWith('v2', 'c1')
    expect(deleteUsagesByCompany).toHaveBeenCalledWith('c1')
    expect(h.borrados).toEqual(expect.arrayContaining([
      'drivers/dr1', 'invitations/i1',
      'users/owner', 'users/miembro', 'companies/c1',
    ]))
  })
  it('si borrar un usuario de Auth falla, sigue con el resto (best-effort)', async () => {
    await deleteCompanyCascade('c1')
    // 'miembro' lanza en Auth pero su perfil igual se borró y el cascade terminó.
    expect(h.authBorrados).toEqual(['owner'])
    expect(h.borrados).toContain('users/miembro')
    expect(h.borrados).toContain('companies/c1')
  })
})
