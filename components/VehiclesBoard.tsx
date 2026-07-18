'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import VehicleCard from '@/components/VehicleCard'
import NewVehicleModal from '@/components/NewVehicleModal'
import { planCapacity } from '@/lib/plan'
import { normalizarBusqueda, coincideBusqueda } from '@/lib/vehicles/buscar'
import { rangoPaginas, HUECO } from '@/lib/vehicles/paginacion'
import type { Vehicle, Categoria } from '@/lib/types'
import type { DocStatus } from '@/lib/documents/status'
import type { EstadoMantencion } from '@/lib/mantencion/status'

type Item = {
  vehicle: Vehicle
  status: DocStatus
  docCount: number
  prolongado: boolean
  horasUso: number
  danoUsageId: string | null
  categoriaId: string | null
  categoriaNombre: string | null
  danoActivo: boolean
  mantencion: EstadoMantencion
  mantencionDetalle: string
}

// Tope de slots fantasma a dibujar (para flotas grandes no tiene sentido
// pintar decenas; el texto del pie comunica el total real disponible).
const MAX_GHOSTS = 6

// Vehículos por página en el dashboard (paginación client-side sobre la lista
// ya filtrada/buscada, así el buscador y los filtros leen toda la flota).
const PAGE_SIZE = 25

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

function SearchIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function ChevronIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

const nombre = (i: Item) => `${i.vehicle.marca} ${i.vehicle.modelo}`

export default function VehiclesBoard({
  items,
  limit,
  canWrite,
  categorias,
}: {
  items: Item[]
  limit: number
  canWrite: boolean
  categorias: Categoria[]
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('todos')
  const [sort, setSort] = useState<SortKey>('urgencia')
  const [categoria, setCategoria] = useState<string>('todas')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const buscando = q.trim().length > 0

  // Cualquier cambio de filtro/búsqueda/categoría/orden vuelve a la página 1
  // (sin useEffect, para no chocar con react-hooks/set-state-in-effect).
  const irAFiltro = (f: Filter) => { setFilter(f); setPage(1) }
  const cambiarBusqueda = (v: string) => { setQ(v); setPage(1) }
  const cambiarOrden = (s: SortKey) => { setSort(s); setPage(1) }
  const cambiarCategoria = (c: string) => { setCategoria(c); setPage(1) }

  const { used, remaining, atCapacity } = planCapacity(items.length, limit)
  const ghosts = canWrite ? Math.min(remaining, MAX_GHOSTS) : 0

  const counts = useMemo(() => {
    const c: Record<DocStatus, number> = { al_dia: 0, por_vencer: 0, vencido: 0, sin_vencimiento: 0 }
    for (const it of items) c[it.status]++
    return c
  }, [items])

  const visible = useMemo(() => {
    const query = normalizarBusqueda(q)
    const list = filter === 'todos' ? items : items.filter((i) => i.status === filter)
    const porCategoria = list.filter((i) => categoria === 'todas' || i.categoriaId === categoria)
    const porBusqueda = porCategoria.filter((i) => coincideBusqueda(i.vehicle, query))
    return [...porBusqueda].sort((a, b) => {
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
  }, [items, filter, sort, categoria, q])

  // Paginación: sobre la lista YA filtrada/buscada (safePage acota si la lista
  // se encogió y la página actual quedó fuera de rango).
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginados = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const enUltimaPagina = safePage === totalPages

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

  const pager = totalPages > 1 && (
    <nav className="mt-6 flex flex-wrap items-center justify-center gap-1" aria-label="Paginación">
      <button
        onClick={() => setPage(safePage - 1)}
        disabled={safePage === 1}
        aria-label="Página anterior"
        className="flex size-9 items-center justify-center rounded-lg border border-linea bg-superficie text-tinta transition-colors hover:bg-lienzo disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronIcon className="size-4 rotate-180" />
      </button>
      {rangoPaginas(safePage, totalPages).map((p, i) =>
        p === HUECO ? (
          <span key={`h${i}`} className="px-1 text-sm text-acero" aria-hidden="true">…</span>
        ) : (
          <button
            key={p}
            onClick={() => setPage(p)}
            aria-current={p === safePage ? 'page' : undefined}
            aria-label={`Página ${p}`}
            className={`flex size-9 items-center justify-center rounded-lg border text-sm font-medium tabular-nums transition-colors ${
              p === safePage
                ? 'border-transparent bg-azul text-white'
                : 'border-linea bg-superficie text-tinta hover:bg-lienzo'
            }`}
          >
            {p}
          </button>
        ),
      )}
      <button
        onClick={() => setPage(safePage + 1)}
        disabled={safePage === totalPages}
        aria-label="Página siguiente"
        className="flex size-9 items-center justify-center rounded-lg border border-linea bg-superficie text-tinta transition-colors hover:bg-lienzo disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronIcon className="size-4" />
      </button>
    </nav>
  )

  const filterOption = (key: Filter, label: string, count: number) => {
    const active = filter === key
    return (
      <button
        key={key}
        onClick={() => irAFiltro(key)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
          active ? 'bg-azul/10 font-semibold text-azul' : 'text-tinta hover:bg-lienzo'
        }`}
      >
        <span>{label}</span>
        <span className="tabular-nums text-xs text-acero">{count}</span>
      </button>
    )
  }

  // Chip de estado para la barra compacta de mobile.
  const filterChip = (key: Filter, label: string, count: number) => {
    const active = filter === key
    return (
      <button
        key={key}
        onClick={() => irAFiltro(key)}
        className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
          active ? 'border-transparent bg-azul/10 text-azul' : 'border-linea bg-superficie text-tinta'
        }`}
      >
        {label}
        <span className="tabular-nums text-xs text-acero">{count}</span>
      </button>
    )
  }

  const searchBar = (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-acero" />
      <input
        type="text"
        value={q}
        onChange={(e) => cambiarBusqueda(e.target.value)}
        placeholder="Buscar por patente, marca o modelo"
        aria-label="Buscar vehículos"
        className="w-full rounded-lg border border-linea bg-superficie py-2.5 pl-9 pr-9 text-sm text-tinta placeholder:text-acero focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
      />
      {buscando && (
        <button
          onClick={() => cambiarBusqueda('')}
          aria-label="Limpiar búsqueda"
          className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-acero transition-colors hover:bg-lienzo hover:text-tinta"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )

  const categoriaSelect = categorias.length > 0 && (
    <select
      aria-label="Categoría"
      value={categoria}
      onChange={(e) => cambiarCategoria(e.target.value)}
      className="w-full rounded-lg border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
    >
      <option value="todas">Todas las categorías</option>
      {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
    </select>
  )

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-tinta">Mis vehículos</h1>
          <p className="mt-1 text-sm text-acero">
            {used} de {limit} {limit === 1 ? 'vehículo registrado' : 'vehículos registrados'}
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() => setOpen(true)}
            disabled={atCapacity}
            title={atCapacity ? 'Alcanzaste el límite de tu plan' : undefined}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-azul"
          >
            <PlusIcon />
            Nuevo vehículo
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mx-auto max-w-2xl">
          {canWrite ? (
            <>
              <div className="space-y-3">{ghostsBlock}</div>
              {footerBlock}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-linea bg-superficie/60 px-6 py-10 text-center">
              <p className="text-sm text-acero">Aún no hay vehículos registrados.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-[210px_1fr]">
          <aside className="hidden space-y-4 sm:block sm:sticky sm:top-20 sm:self-start">
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
                onChange={(e) => cambiarOrden(e.target.value as SortKey)}
                className="w-full rounded-lg border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            {categorias.length > 0 && (
              <div className="rounded-2xl border border-linea bg-superficie p-3 shadow-sm">
                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-acero">Categoría</p>
                {categoriaSelect}
              </div>
            )}
          </aside>

          <div className="min-w-0">
            <div className="mb-3">{searchBar}</div>
            {/* Filtros compactos (solo mobile): chips de estado + orden. */}
            <div className="mb-3 space-y-2 sm:hidden">
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                {filterChip('todos', 'Todos', items.length)}
                {STATUS_META.filter((s) => counts[s.key] > 0).map((s) => filterChip(s.key, s.label, counts[s.key]))}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {categorias.length > 0 && (
                  <select
                    aria-label="Categoría"
                    value={categoria}
                    onChange={(e) => cambiarCategoria(e.target.value)}
                    className="rounded-lg border border-linea bg-superficie px-3 py-1.5 text-sm text-tinta focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
                  >
                    <option value="todas">Todas las categorías</option>
                    {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                )}
                <select
                  aria-label="Ordenar por"
                  value={sort}
                  onChange={(e) => cambiarOrden(e.target.value as SortKey)}
                  className="rounded-lg border border-linea bg-superficie px-3 py-1.5 text-sm text-tinta focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
                >
                  {SORTS.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {visible.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-linea bg-superficie/60 px-6 py-10 text-center">
                <p className="text-sm text-acero">
                  {buscando ? 'Ningún vehículo coincide con tu búsqueda.' : 'Ningún vehículo con ese estado.'}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {paginados.map(({ vehicle, status, docCount, prolongado, horasUso, danoUsageId, categoriaNombre, danoActivo, mantencion, mantencionDetalle }) => (
                    <VehicleCard key={vehicle.id} vehicle={vehicle} status={status} docCount={docCount} prolongado={prolongado} horasUso={horasUso} danoUsageId={danoUsageId} categoriaNombre={categoriaNombre} danoActivo={danoActivo} mantencion={mantencion} mantencionDetalle={mantencionDetalle} />
                  ))}
                  {enUltimaPagina && canWrite && filter === 'todos' && !buscando && ghostsBlock}
                </div>
                {pager}
              </>
            )}
            {enUltimaPagina && canWrite && filter === 'todos' && !buscando && footerBlock}
          </div>
        </div>
      )}

      {canWrite && <NewVehicleModal open={open} onClose={() => setOpen(false)} />}
    </main>
  )
}
