import { adminDb } from '@/lib/firebase/admin'
import type { UserProfile } from '@/lib/types'

const COL = 'users'

export async function getProfile(uid: string, email: string): Promise<UserProfile> {
  const doc = await adminDb.collection(COL).doc(uid).get()
  if (!doc.exists) {
    // Un usuario real siempre tiene companyId/role tras la migración; esto es
    // solo un default seguro si el doc no existe todavía.
    return { email, displayName: '', companyId: '', role: 'viewer', createdAt: null }
  }
  const d = doc.data()!
  return {
    email: d.email ?? email,
    displayName: d.displayName ?? '',
    companyId: d.companyId ?? '',
    role: d.role ?? 'viewer',
    createdAt: d.createdAt ?? null,
  }
}

// `company`/`plan` ahora viven en `companies/{companyId}` (ver lib/data/companies.ts)
// y los edita solo un admin de empresa vía /api/company. El perfil del usuario
// (`users/{uid}`) solo guarda datos personales (`displayName`).
export async function saveProfile(
  uid: string,
  email: string,
  patch: { displayName?: string },
): Promise<void> {
  const ref = adminDb.collection(COL).doc(uid)
  const snap = await ref.get()
  const data: Record<string, unknown> = {}
  if (patch.displayName !== undefined) data.displayName = patch.displayName
  if (!snap.exists) {
    data.email = email
    data.createdAt = new Date().toISOString()
  }
  await ref.set(data, { merge: true })
}

export async function deleteProfile(uid: string): Promise<void> {
  await adminDb.collection(COL).doc(uid).delete()
}
