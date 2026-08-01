import { describe, it, expect, vi, beforeEach } from 'vitest'

const companySet = vi.fn()
const companyAdd = vi.fn()
const companyDocGet = vi.fn()

// adminDb.collection('companies').add(...) / .doc(id).set(...) / .doc(id).get()
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      add: companyAdd,
      doc: () => ({ set: companySet, get: companyDocGet }),
    }),
  },
}))

import { createCompany, getCompany, savePlan } from '@/lib/data/companies'
import { debeElegirPlan } from '@/lib/plan'
import { EMPTY_COMPANY } from '@/lib/types'

beforeEach(() => {
  companySet.mockReset()
  companyAdd.mockReset()
  companyDocGet.mockReset()
})

describe('createCompany', () => {
  it('siembra `periodicidad: null` explícito', async () => {
    companyAdd.mockResolvedValue({ id: 'c1' })
    await createCompany('u1', { company: { ...EMPTY_COMPANY }, plan: { maxVehiculos: 3 } })
    expect(companyAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: { maxVehiculos: 3, periodicidad: null },
      }),
    )
  })
})

describe('getCompany', () => {
  it('conserva `periodicidad: null` cuando el doc la trae', async () => {
    companyDocGet.mockResolvedValue({
      exists: true,
      id: 'c1',
      data: () => ({ plan: { maxVehiculos: 5, periodicidad: null } }),
    })
    const company = await getCompany('c1')
    expect(company?.plan.periodicidad).toBeNull()
  })

  it('deja `periodicidad` AUSENTE cuando el doc no la trae', async () => {
    companyDocGet.mockResolvedValue({
      exists: true,
      id: 'c1',
      data: () => ({ plan: { maxVehiculos: 5 } }),
    })
    const company = await getCompany('c1')
    expect(company).not.toBeNull()
    expect('periodicidad' in (company!.plan)).toBe(false)
    expect(debeElegirPlan(company!.plan)).toBe(false)
  })
})

describe('savePlan', () => {
  it('con un solo campo escribe solo ese campo bajo `plan`', async () => {
    await savePlan('c1', { periodicidad: 'anual' })
    expect(companySet).toHaveBeenCalledWith({ plan: { periodicidad: 'anual' } }, { merge: true })
  })

  it('aplica el mínimo de 1 a maxVehiculos', async () => {
    await savePlan('c1', { maxVehiculos: 0 })
    expect(companySet).toHaveBeenCalledWith({ plan: { maxVehiculos: 1 } }, { merge: true })
  })

  it('con un patch vacío no escribe nada', async () => {
    await savePlan('c1', {})
    expect(companySet).not.toHaveBeenCalled()
  })

  it('nunca manda `undefined` a Firestore', async () => {
    await savePlan('c1', { periodicidad: undefined, gratisHasta: '2026-09-01' })
    const written = companySet.mock.calls[0][0]
    expect('periodicidad' in written.plan).toBe(false)
    expect(written.plan.gratisHasta).toBe('2026-09-01')
  })
})
