import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { DEFAULT_PLAN } from '@/lib/types'
import { maxVehiculosDe } from '@/lib/plan'

export interface AdminCompanyRow {
  companyId: string
  razonSocial: string
  ownerEmail: string
  vehicleCount: number
  maxVehiculos: number
}

// Lista todas las empresas de la plataforma para el panel admin: cruza las
// empresas con la cantidad de vehículos (agrupados por companyId) y el email
// del dueño (via Auth). MVP: sin paginación — suficiente por ahora.
export async function listAllCompanies(): Promise<AdminCompanyRow[]> {
  const [companiesSnap, vehSnap] = await Promise.all([
    adminDb.collection('companies').get(),
    adminDb.collection('vehicles').get(),
  ])

  const counts = new Map<string, number>()
  for (const d of vehSnap.docs) {
    const companyId = d.data().companyId as string | undefined
    if (companyId) counts.set(companyId, (counts.get(companyId) ?? 0) + 1)
  }

  const rows = await Promise.all(
    companiesSnap.docs.map(async (d) => {
      const data = d.data()
      let ownerEmail = ''
      try {
        const u = await adminAuth.getUser(data.ownerUid)
        ownerEmail = u.email ?? ''
      } catch {
        ownerEmail = ''
      }
      return {
        companyId: d.id,
        razonSocial: data.company?.razonSocial ?? '',
        ownerEmail,
        vehicleCount: counts.get(d.id) ?? 0,
        maxVehiculos: maxVehiculosDe({ ...DEFAULT_PLAN, ...(data.plan ?? {}) }),
      }
    }),
  )

  return rows.sort((a, b) => (a.razonSocial || a.ownerEmail).localeCompare(b.razonSocial || b.ownerEmail))
}
