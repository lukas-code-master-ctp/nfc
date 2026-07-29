import { Bloque, Linea } from '@/components/skeleton/Skeleton'

function TarjetaFantasma() {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-linea bg-superficie p-4 shadow-sm">
      <Bloque className="size-11 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Linea className="w-40" />
        <Linea className="w-24" />
      </div>
      <Bloque className="h-6 w-20 shrink-0 rounded-full" />
    </div>
  )
}

export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8" role="status" aria-label="Cargando los vehículos">
      <div className="grid gap-6 sm:grid-cols-[210px_1fr]">
        <aside className="hidden space-y-4 sm:block">
          <Bloque className="h-40 w-full" />
          <Bloque className="h-24 w-full" />
        </aside>
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, i) => <TarjetaFantasma key={i} />)}
        </div>
      </div>
    </main>
  )
}
