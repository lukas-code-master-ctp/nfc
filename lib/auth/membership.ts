import { getCurrentUser } from '@/lib/auth/session'
import { adminDb } from '@/lib/firebase/admin'
import type { Role } from '@/lib/auth/roles'

export interface Membership {
  uid: string
  email: string
  companyId: string
  role: Role
}

export async function getMembership(): Promise<Membership | null> {
  const user = await getCurrentUser()
  if (!user) return null
  const doc = await adminDb.collection('users').doc(user.uid).get()
  if (!doc.exists) return null
  const d = doc.data()!
  if (!d.companyId || !d.role) return null
  return { uid: user.uid, email: user.email, companyId: d.companyId, role: d.role as Role }
}
