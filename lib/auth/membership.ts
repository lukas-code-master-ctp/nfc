import { getCurrentUser } from '@/lib/auth/session'
import { adminDb } from '@/lib/firebase/admin'
import { sesionRevocada } from '@/lib/auth/revocacion'
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
  // La revocación se comprueba ACÁ y no en `getCurrentUser()` porque este
  // documento ya se está leyendo: no cuesta ninguna consulta extra. En
  // `getCurrentUser()` costaría una lectura en cada navegación, para siempre,
  // porque lo llama el layout de `(app)`.
  if (sesionRevocada(user.authTime, d.sesionesValidasDesde)) return null
  if (!d.companyId || !d.role) return null
  return { uid: user.uid, email: user.email, companyId: d.companyId, role: d.role as Role }
}
