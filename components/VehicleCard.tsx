import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'
import PillTip from '@/components/PillTip'
import Popover from '@/components/Popover'
import { destinoVehiculo } from '@/lib/vehicles/destino'
import type { DocStatus } from '@/lib/documents/status'
import type { Vehicle } from '@/lib/types'
import type { EstadoMantencion } from '@/lib/mantencion/status'

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

const pill = 'whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium'

export default function VehicleCard({
  vehicle, status, docCount = 0, prolongado = false, horasUso = 0, danoUsageId = null, categoriaNombre = null, danoActivo = false, mantencion = 'sin_pauta', mantencionDetalle = '', transferenciaPendiente = false,
}: {
  vehicle: Vehicle
  status: DocStatus
  docCount?: number
  prolongado?: boolean
  horasUso?: number
  danoUsageId?: string | null
  categoriaNombre?: string | null
  danoActivo?: boolean
  mantencion?: EstadoMantencion
  mantencionDetalle?: string
  transferenciaPendiente?: boolean
}) {
  const uso = vehicle.usoActual ?? null
  const puntoColor = prolongado ? '#B45309' : '#15803D'
  const nombre = `${vehicle.marca} ${vehicle.modelo} · ${vehicle.patente}`
  const href = destinoVehiculo({ vehicleId: vehicle.id, danoUsageId, documentos: status, mantencion })

  return (
    <div className="relative flex items-center gap-4 rounded-2xl border border-linea bg-superficie p-4 shadow-sm transition-shadow hover:shadow-md">
      {/*
        El enlace cubre la tarjeta como una capa en vez de envolverla. Envolviéndola
        no se pueden poner botones adentro (HTML no permite contenido interactivo
        dentro de un `<a>`), y sin botones el detalle de las pills solo cabía en un
        `title` — invisible en un celular, que es donde se usa la app.
        El resto del contenido va con `pointer-events-none` para que el clic
        atraviese hasta esta capa; lo interactivo la sobrepasa con `z-20`.
      */}
      <Link
        href={href}
        aria-label={nombre}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
      />

      <span className="pointer-events-none relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-azul/10 text-azul">
        <CarIcon className="size-6" />
        {uso && (
          <span className="pointer-events-auto absolute -right-2.5 -top-2.5 z-20">
            <Popover
              alineacion="izquierda"
              ariaLabel={prolongado ? 'Vehículo en uso, sin entregar' : 'Vehículo en uso'}
              claseBoton="flex items-center justify-center rounded-full p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
              etiqueta={
                <span className="flex size-3">
                  <span className="absolute inline-flex size-3 animate-ping rounded-full opacity-60" style={{ backgroundColor: puntoColor }} />
                  <span className="relative inline-flex size-3 rounded-full border-2 border-superficie" style={{ backgroundColor: puntoColor }} />
                </span>
              }
            >
              <p className="font-semibold">En uso por {uso.driverNombre}</p>
              <p className="mt-0.5 text-acero">Desde {horaUso(uso.tomadoEn)}</p>
              {prolongado && <p className="mt-1 font-medium text-[#B45309]">Sin entregar hace {horasUso} h</p>}
            </Popover>
          </span>
        )}
      </span>

      <div className="pointer-events-none flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-tinta">{nombre}</p>
          <p className="truncate text-sm text-acero">
            Documentación · {docCount} {docCount === 1 ? 'archivo' : 'archivos'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:justify-end">
          {categoriaNombre && <span className={`${pill} bg-[#EEF0F3] text-acero`}>{categoriaNombre}</span>}
          {danoActivo && <span className={`${pill} bg-[#FCE7E7] text-[#C81E1E]`}>Dañado</span>}
          {danoUsageId && <span className={`${pill} bg-[#FCE7E7] text-[#C81E1E]`}>Daño reportado</span>}
          {/* El envoltorio va con `flex`: como bloque contendría una caja inline y
              heredaría el line-height de 24px, estirando la pill de 20 a 24px
              (medido) y descalzando la tarjeta de su skeleton. */}
          {(mantencion === 'vencida' || mantencion === 'proxima') && (
            <span className="pointer-events-auto relative z-20 flex">
              <PillTip
                label={mantencion === 'vencida' ? 'Mantención vencida' : 'Mantención próxima'}
                tono={mantencion === 'vencida' ? 'rojo' : 'ambar'}
              >
                <p className="font-semibold">
                  {mantencion === 'vencida' ? 'Mantención vencida' : 'Mantención próxima'}
                </p>
                <p className="mt-0.5 text-acero">{mantencionDetalle || 'Sin detalle disponible.'}</p>
              </PillTip>
            </span>
          )}
          {transferenciaPendiente && <span className={`${pill} bg-[#EEF0F3] text-acero`}>Transferencia pendiente</span>}
          <StatusBadge status={status} variant="vehicle" />
        </div>
      </div>
    </div>
  )
}
