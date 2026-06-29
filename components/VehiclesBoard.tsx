'use client'
import { useState } from 'react'
import Link from 'next/link'
import VehicleCard from '@/components/VehicleCard'
import NewVehicleModal from '@/components/NewVehicleModal'
import { planCapacity } from '@/lib/plan'
import type { Vehicle } from '@/lib/types'
import type { DocStatus } from '@/lib/documents/status'

type Item = { vehicle: Vehicle; status: DocStatus; docCount: number }

// Tope de slots fantasma a dibujar (para flotas grandes no tiene sentido
// pintar decenas; el texto del pie comunica el total real disponible).
const MAX_GHOSTS = 6

function PlusIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export default function VehiclesBoard({ items, limit }: { items: Item[]; limit: number }) {
  const [open, setOpen] = useState(false)
  const { used, remaining, atCapacity } = planCapacity(items.length, limit)
  const ghosts = Math.min(remaining, MAX_GHOSTS)

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-tinta">Mis vehículos</h1>
          <p className="mt-1 text-sm text-acero">
            {used} de {limit} {limit === 1 ? 'vehículo registrado' : 'vehículos registrados'}
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          disabled={atCapacity}
          title={atCapacity ? 'Alcanzaste el límite de tu plan' : undefined}
          className="inline-flex items-center gap-1.5 rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-azul"
        >
          <PlusIcon />
          Nuevo vehículo
        </button>
      </div>

      <div className="space-y-3">
        {items.map(({ vehicle, status, docCount }) => (
          <VehicleCard key={vehicle.id} vehicle={vehicle} status={status} docCount={docCount} />
        ))}

        {Array.from({ length: ghosts }).map((_, i) => (
          <button
            key={i}
            onClick={() => setOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-linea bg-superficie/40 px-6 py-6 text-sm font-medium text-acero transition-colors hover:border-azul/50 hover:bg-azul/[0.03] hover:text-azul"
          >
            <PlusIcon />
            Nuevo vehículo
          </button>
        ))}
      </div>

      <div className="mt-6 border-t border-dashed border-linea pt-6 text-center">
        {atCapacity ? (
          <Link
            href="/facturacion"
            className="inline-flex items-center gap-2 rounded-xl bg-azul px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-azul-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
          >
            <PlusIcon />
            Agrega vehículos a tu plan
          </Link>
        ) : (
          <p className="text-sm text-acero">
            {remaining} {remaining === 1 ? 'vehículo aún disponible' : 'vehículos aún disponibles'} con tu plan
          </p>
        )}
      </div>

      <NewVehicleModal open={open} onClose={() => setOpen(false)} />
    </main>
  )
}
