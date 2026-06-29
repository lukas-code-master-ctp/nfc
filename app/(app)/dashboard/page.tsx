import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { listVehicles } from '@/lib/data/vehicles'
import { listDocuments } from '@/lib/data/documents'
import { getProfile } from '@/lib/data/profile'
import { documentStatus, worstStatus, type DocStatus } from '@/lib/documents/status'
import { maxVehiculos, planCapacity } from '@/lib/plan'
import VehicleCard from '@/components/VehicleCard'
import NewVehicleForm from '@/components/NewVehicleForm'
import PlanCapacity from '@/components/PlanCapacity'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [vehicles, profile] = await Promise.all([
    listVehicles(user.uid),
    getProfile(user.uid, user.email),
  ])
  const limit = maxVehiculos(profile)
  const { atCapacity } = planCapacity(vehicles.length, limit)

  const now = new Date()
  const withStatus = await Promise.all(
    vehicles.map(async (v) => {
      const docs = await listDocuments(v.id)
      const statuses: DocStatus[] = docs.map((d) => documentStatus(d.fechaVencimiento, now))
      return { vehicle: v, status: worstStatus(statuses), docCount: docs.length }
    }),
  )

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-tinta">Mis vehículos</h1>
          <p className="mt-1 text-sm text-acero">
            {withStatus.length} de {limit} {limit === 1 ? 'vehículo' : 'vehículos'} de tu plan
          </p>
        </div>
        <NewVehicleForm disabled={atCapacity} />
      </div>

      {withStatus.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-linea bg-superficie/60 px-6 py-12 text-center">
          <p className="font-medium text-tinta">Aún no tienes vehículos</p>
          <p className="mt-1 text-sm text-acero">
            Registra tu primer vehículo para empezar a guardar su documentación.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <PlanCapacity used={withStatus.length} limit={limit} />
          <div className="space-y-3">
            {withStatus.map(({ vehicle, status, docCount }) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} status={status} docCount={docCount} />
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
