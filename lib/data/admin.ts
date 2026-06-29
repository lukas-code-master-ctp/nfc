import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { DEFAULT_PLAN } from '@/lib/types'
import { maxVehiculos } from '@/lib/plan'

export interface AdminUserRow {
  uid: string
  email: string
  displayName: string
  razonSocial: string
  vehicleCount: number
  maxVehiculos: number
}

// Lista todos los usuarios de la plataforma para el panel admin: cruza los
// usuarios de Auth con su perfil (plan, empresa) y la cantidad de vehículos.
// MVP: lee hasta 1000 usuarios de Auth (sin paginación) — suficiente por ahora.
export async function listAllUsers(): Promise<AdminUserRow[]> {
  const [authList, vehSnap, usersSnap] = await Promise.all([
    adminAuth.listUsers(1000),
    adminDb.collection('vehicles').get(),
    adminDb.collection('users').get(),
  ])

  const counts = new Map<string, number>()
  for (const d of vehSnap.docs) {
    const uid = d.data().ownerUid as string | undefined
    if (uid) counts.set(uid, (counts.get(uid) ?? 0) + 1)
  }

  const profiles = new Map<string, FirebaseFirestore.DocumentData>()
  for (const d of usersSnap.docs) profiles.set(d.id, d.data())

  return authList.users
    .map((u) => {
      const p = profiles.get(u.uid) ?? {}
      return {
        uid: u.uid,
        email: u.email ?? '',
        displayName: p.displayName ?? '',
        razonSocial: p.company?.razonSocial ?? '',
        vehicleCount: counts.get(u.uid) ?? 0,
        maxVehiculos: maxVehiculos({ plan: { ...DEFAULT_PLAN, ...(p.plan ?? {}) } }),
      }
    })
    .sort((a, b) => a.email.localeCompare(b.email))
}
