import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'
import type { DocStatus } from '@/lib/documents/status'
import type { Vehicle } from '@/lib/types'

export default function VehicleCard({ vehicle, status }: { vehicle: Vehicle; status: DocStatus }) {
  return (
    <Link href={`/vehiculos/${vehicle.id}`}
      className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50">
      <div>
        <p className="font-semibold">{vehicle.patente}</p>
        <p className="text-sm text-gray-600">{vehicle.marca} {vehicle.modelo} · {vehicle.anio}</p>
      </div>
      <StatusBadge status={status} />
    </Link>
  )
}
