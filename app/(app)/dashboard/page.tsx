import { redirect } from 'next/navigation'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { listVehicles } from '@/lib/data/vehicles'
import { listDocuments } from '@/lib/data/documents'
import { getCompany } from '@/lib/data/companies'
import { documentStatus, worstStatus, type DocStatus } from '@/lib/documents/status'
import { maxVehiculosDe } from '@/lib/plan'
import VehiclesBoard from '@/components/VehiclesBoard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const m = await getMembership()
  if (!m) redirect('/login')

  const [vehicles, company] = await Promise.all([
    listVehicles(m.companyId),
    getCompany(m.companyId),
  ])
  const limit = maxVehiculosDe(company?.plan)

  const now = new Date()
  const items = await Promise.all(
    vehicles.map(async (v) => {
      const docs = await listDocuments(v.id)
      const statuses: DocStatus[] = docs.map((d) => documentStatus(d.fechaVencimiento, now))
      return { vehicle: v, status: worstStatus(statuses), docCount: docs.length }
    }),
  )

  return <VehiclesBoard items={items} limit={limit} canWrite={can(m.role, 'vehicle:write')} />
}
