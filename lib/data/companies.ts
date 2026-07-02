import { adminDb } from '@/lib/firebase/admin'
import { DEFAULT_PLAN, EMPTY_COMPANY, type Company, type CompanyData, type PlanData } from '@/lib/types'

const COL = 'companies'

export async function getCompany(companyId: string): Promise<Company | null> {
  const doc = await adminDb.collection(COL).doc(companyId).get()
  if (!doc.exists) return null
  const d = doc.data()!
  return {
    id: doc.id,
    ownerUid: d.ownerUid,
    company: { ...EMPTY_COMPANY, ...(d.company ?? {}) },
    plan: { ...DEFAULT_PLAN, ...(d.plan ?? {}) },
    createdAt: d.createdAt ?? null,
  }
}

export async function createCompany(
  ownerUid: string,
  data: { company: CompanyData; plan: PlanData },
): Promise<string> {
  const ref = await adminDb.collection(COL).add({
    ownerUid,
    company: data.company,
    plan: { maxVehiculos: Math.max(1, Math.floor(data.plan.maxVehiculos)) },
    createdAt: new Date().toISOString(),
  })
  return ref.id
}

// Solo un Administrador de la empresa llama esto (validado en la capa /api).
export async function saveCompany(
  companyId: string,
  patch: { company?: CompanyData; plan?: PlanData },
): Promise<void> {
  const data: Record<string, unknown> = {}
  if (patch.company !== undefined) data.company = patch.company
  if (patch.plan !== undefined) data.plan = { maxVehiculos: Math.max(1, Math.floor(patch.plan.maxVehiculos)) }
  await adminDb.collection(COL).doc(companyId).set(data, { merge: true })
}
