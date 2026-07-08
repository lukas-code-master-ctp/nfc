import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'
import type { DocStatus } from '@/lib/documents/status'
import type { Vehicle } from '@/lib/types'

function horaUso(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
}

function CarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" /><path d="M9 17h6" /><circle cx="17" cy="17" r="2" />
    </svg>
  )
}

export default function VehicleCard({
  vehicle, status, docCount = 0, prolongado = false, horasUso = 0, danoUsageId = null, categoriaNombre = null,
}: {
  vehicle: Vehicle
  status: DocStatus
  docCount?: number
  prolongado?: boolean
  horasUso?: number
  danoUsageId?: string | null
  categoriaNombre?: string | null
}) {
  const uso = vehicle.usoActual ?? null
  const puntoColor = prolongado ? '#B45309' : '#15803D'
  const tituloPunto = uso
    ? `En uso por ${uso.driverNombre} · desde ${horaUso(uso.tomadoEn)}${prolongado ? ` · sin entregar hace ${horasUso}h` : ''}`
    : ''
  const href = danoUsageId ? `/vehiculos/${vehicle.id}#uso-${danoUsageId}` : `/vehiculos/${vehicle.id}`

  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border border-linea bg-superficie p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
    >
      <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-azul/10 text-azul">
        <CarIcon className="size-6" />
        {uso && (
          <span className="absolute -right-1 -top-1 flex size-3" title={tituloPunto}>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: puntoColor }} />
            <span className="relative inline-flex size-3 rounded-full border-2 border-superficie" style={{ backgroundColor: puntoColor }} />
          </span>
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-tinta">
            {vehicle.marca} {vehicle.modelo} · {vehicle.patente}
          </p>
          <p className="truncate text-sm text-acero">
            Documentación · {docCount} {docCount === 1 ? 'archivo' : 'archivos'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:justify-end">
          {categoriaNombre && (
            <span className="whitespace-nowrap rounded-full bg-[#EEF0F3] px-2 py-0.5 text-xs font-medium text-acero">{categoriaNombre}</span>
          )}
          {danoUsageId && (
            <span className="whitespace-nowrap rounded-full bg-[#FCE7E7] px-2 py-0.5 text-xs font-medium text-[#C81E1E]">Daño reportado</span>
          )}
          <StatusBadge status={status} variant="vehicle" />
        </div>
      </div>
    </Link>
  )
}
