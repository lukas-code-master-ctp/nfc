import { adminDb } from '@/lib/firebase/admin'
import { DEFAULT_PLAN, EMPTY_COMPANY, type CompanyData, type PlanData, type UserProfile } from '@/lib/types'

const COL = 'users'

export async function getProfile(uid: string, email: string): Promise<UserProfile> {
  const doc = await adminDb.collection(COL).doc(uid).get()
  if (!doc.exists) {
    return { email, displayName: '', company: { ...EMPTY_COMPANY }, plan: { ...DEFAULT_PLAN }, createdAt: null }
  }
  const d = doc.data()!
  return {
    email: d.email ?? email,
    displayName: d.displayName ?? '',
    company: { ...EMPTY_COMPANY, ...(d.company ?? {}) },
    plan: { ...DEFAULT_PLAN, ...(d.plan ?? {}) },
    createdAt: d.createdAt ?? null,
  }
}

// `plan` solo lo setea el admin de la plataforma (no el endpoint del propio
// usuario), por eso no se expone en /api/profile PATCH.
export async function saveProfile(
  uid: string,
  email: string,
  patch: { displayName?: string; company?: CompanyData; plan?: PlanData },
): Promise<void> {
  const ref = adminDb.collection(COL).doc(uid)
  const snap = await ref.get()
  const data: Record<string, unknown> = {}
  if (patch.displayName !== undefined) data.displayName = patch.displayName
  if (patch.company !== undefined) data.company = patch.company
  if (patch.plan !== undefined) data.plan = { maxVehiculos: Math.max(1, Math.floor(patch.plan.maxVehiculos)) }
  if (!snap.exists) {
    data.email = email
    data.createdAt = new Date().toISOString()
  }
  await ref.set(data, { merge: true })
}

export async function deleteProfile(uid: string): Promise<void> {
  await adminDb.collection(COL).doc(uid).delete()
}
