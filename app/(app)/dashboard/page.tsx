import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { listVehicles } from '@/lib/data/vehicles'
import { listDocuments } from '@/lib/data/documents'
import { getProfile } from '@/lib/data/profile'
import { documentStatus, worstStatus, type DocStatus } from '@/lib/documents/status'
import { maxVehiculos } from '@/lib/plan'
import VehiclesBoard from '@/components/VehiclesBoard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [vehicles, profile] = await Promise.all([
    listVehicles(user.uid),
    getProfile(user.uid, user.email),
  ])
  const limit = maxVehiculos(profile)

  const now = new Date()
  const items = await Promise.all(
    vehicles.map(async (v) => {
      const docs = await listDocuments(v.id)
      const statuses: DocStatus[] = docs.map((d) => documentStatus(d.fechaVencimiento, now))
      return { vehicle: v, status: worstStatus(statuses), docCount: docs.length }
    }),
  )

  return <VehiclesBoard items={items} limit={limit} />
}
