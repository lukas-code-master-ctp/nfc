import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { listVehicles } from '@/lib/data/vehicles'
import { listDocuments } from '@/lib/data/documents'
import { documentStatus, worstStatus, type DocStatus } from '@/lib/documents/status'
import VehicleCard from '@/components/VehicleCard'
import NewVehicleForm from '@/components/NewVehicleForm'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const vehicles = await listVehicles(user.uid)
  const now = new Date()
  const withStatus = await Promise.all(
    vehicles.map(async (v) => {
      const docs = await listDocuments(v.id)
      const statuses: DocStatus[] = docs.map((d) => documentStatus(d.fechaVencimiento, now))
      return { vehicle: v, status: worstStatus(statuses) }
    }),
  )

  return (
    <main className="mx-auto max-w-2xl p-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mis vehículos</h1>
        <NewVehicleForm />
      </div>
      {withStatus.length === 0 ? (
        <p className="text-gray-500">Aún no tienes vehículos registrados.</p>
      ) : (
        <div className="space-y-3">
          {withStatus.map(({ vehicle, status }) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} status={status} />
          ))}
        </div>
      )}
    </main>
  )
}
