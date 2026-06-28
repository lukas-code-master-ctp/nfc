import { adminDb } from '@/lib/firebase/admin'
import { EMPTY_COMPANY, type CompanyData, type UserProfile } from '@/lib/types'

const COL = 'users'

export async function getProfile(uid: string, email: string): Promise<UserProfile> {
  const doc = await adminDb.collection(COL).doc(uid).get()
  if (!doc.exists) {
    return { email, displayName: '', company: { ...EMPTY_COMPANY }, createdAt: null }
  }
  const d = doc.data()!
  return {
    email: d.email ?? email,
    displayName: d.displayName ?? '',
    company: { ...EMPTY_COMPANY, ...(d.company ?? {}) },
    createdAt: d.createdAt ?? null,
  }
}

export async function saveProfile(
  uid: string,
  email: string,
  patch: { displayName?: string; company?: CompanyData },
): Promise<void> {
  const ref = adminDb.collection(COL).doc(uid)
  const snap = await ref.get()
  const data: Record<string, unknown> = {}
  if (patch.displayName !== undefined) data.displayName = patch.displayName
  if (patch.company !== undefined) data.company = patch.company
  if (!snap.exists) {
    data.email = email
    data.createdAt = new Date().toISOString()
  }
  await ref.set(data, { merge: true })
}

export async function deleteProfile(uid: string): Promise<void> {
  await adminDb.collection(COL).doc(uid).delete()
}
