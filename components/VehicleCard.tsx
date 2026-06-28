import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'
import type { DocStatus } from '@/lib/documents/status'
import type { Vehicle } from '@/lib/types'

function CarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <path d="M9 17h6" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  )
}

export default function VehicleCard({
  vehicle,
  status,
  docCount = 0,
}: {
  vehicle: Vehicle
  status: DocStatus
  docCount?: number
}) {
  return (
    <Link
      href={`/vehiculos/${vehicle.id}`}
      className="group flex items-center gap-4 rounded-2xl border border-linea bg-superficie p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-azul/10 text-azul">
        <CarIcon className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-tinta">
          {vehicle.marca} {vehicle.modelo} · {vehicle.patente}
        </p>
        <p className="truncate text-sm text-acero">
          Documentación · {docCount} {docCount === 1 ? 'archivo' : 'archivos'}
        </p>
      </div>
      <StatusBadge status={status} variant="vehicle" />
    </Link>
  )
}
