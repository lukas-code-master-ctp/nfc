'use client'
import { useMemo, useState } from 'react'
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

// Estados ordenados por urgencia (más urgente primero) para el filtro y el orden.
const STATUS_META: { key: DocStatus; label: string }[] = [
  { key: 'vencido', label: 'Vencidos' },
  { key: 'por_vencer', label: 'Por vencer' },
  { key: 'al_dia', label: 'Al día' },
  { key: 'sin_vencimiento', label: 'Sin vencimiento' },
]
const PRIORITY: Record<DocStatus, number> = { vencido: 0, por_vencer: 1, al_dia: 2, sin_vencimiento: 3 }

const SORTS = [
  { key: 'urgencia', label: 'Urgencia' },
  { key: 'marca', label: 'Marca / modelo' },
  { key: 'patente', label: 'Patente' },
  { key: 'documentos', label: 'N° de documentos' },
] as const
type SortKey = (typeof SORTS)[number]['key']

type Filter = 'todos' | DocStatus

function PlusIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

const nombre = (i: Item) => `${i.vehicle.marca} ${i.vehicle.modelo}`

export default function VehiclesBoard({ items, limit }: { items: Item[]; limit: number }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('todos')
  const [sort, setSort] = useState<SortKey>('urgencia')

  const { used, remaining, atCapacity } = planCapacity(items.length, limit)
  const ghosts = Math.min(remaining, MAX_GHOSTS)

  const counts = useMemo(() => {
    const c: Record<DocStatus, number> = { al_dia: 0, por_vencer: 0, vencido: 0, sin_vencimiento: 0 }
    for (const it of items) c[it.status]++
    return c
  }, [items])

  const visible = useMemo(() => {
    const list = filter === 'todos' ? items : items.filter((i) => i.status === filter)
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'urgencia':
          return PRIORITY[a.status] - PRIORITY[b.status] || nombre(a).localeCompare(nombre(b), 'es')
        case 'marca':
          return nombre(a).localeCompare(nombre(b), 'es')
        case 'patente':
          return a.vehicle.patente.localeCompare(b.vehicle.patente, 'es')
        case 'documentos':
          return b.docCount - a.docCount
        default:
          return 0
      }
    })
  }, [items, filter, sort])

  const ghostsBlock = Array.from({ length: ghosts }).map((_, i) => (
    <button
      key={i}
      onClick={() => setOpen(true)}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-linea bg-superficie/40 px-6 py-6 text-sm font-medium text-acero transition-colors hover:border-azul/50 hover:bg-azul/[0.03] hover:text-azul"
    >
      <PlusIcon />
      Nuevo vehículo
    </button>
  ))

  const footerBlock = (
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
  )

  const filterOption = (key: Filter, label: string, count: number) => {
    const active = filter === key
    return (
      <button
        key={key}
        onClick={() => setFilter(key)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
          active ? 'bg-azul/10 font-semibold text-azul' : 'text-tinta hover:bg-lienzo'
        }`}
      >
        <span>{label}</span>
        <span className="tabular-nums text-xs text-acero">{count}</span>
      </button>
    )
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
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

      {items.length === 0 ? (
        <div className="mx-auto max-w-2xl">
          <div className="space-y-3">{ghostsBlock}</div>
          {footerBlock}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-[210px_1fr]">
          <aside className="space-y-4 sm:sticky sm:top-20 sm:self-start">
            <div className="rounded-2xl border border-linea bg-superficie p-3 shadow-sm">
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-acero">Estado</p>
              <div className="space-y-0.5">
                {filterOption('todos', 'Todos', items.length)}
                {STATUS_META.filter((s) => counts[s.key] > 0).map((s) => filterOption(s.key, s.label, counts[s.key]))}
              </div>
            </div>
            <div className="rounded-2xl border border-linea bg-superficie p-3 shadow-sm">
              <label htmlFor="sort" className="mb-2 block px-1 text-xs font-semibold uppercase tracking-wide text-acero">
                Ordenar por
              </label>
              <select
                id="sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="w-full rounded-lg border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </aside>

          <div>
            {visible.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-linea bg-superficie/60 px-6 py-10 text-center">
                <p className="text-sm text-acero">Ningún vehículo con ese estado.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visible.map(({ vehicle, status, docCount }) => (
                  <VehicleCard key={vehicle.id} vehicle={vehicle} status={status} docCount={docCount} />
                ))}
                {filter === 'todos' && ghostsBlock}
              </div>
            )}
            {filter === 'todos' && footerBlock}
          </div>
        </div>
      )}

      <NewVehicleModal open={open} onClose={() => setOpen(false)} />
    </main>
  )
}
