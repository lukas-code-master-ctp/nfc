import { Bloque, Linea } from '@/components/skeleton/Skeleton'

export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <p className="sr-only" role="status">Cargando el vehículo</p>
      <Linea className="w-24" />

      <div className="flex items-center gap-4 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
        <Bloque className="size-12 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <Linea className="h-4 w-3/5" />
          <Linea className="w-2/5" />
        </div>
      </div>

      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => <Bloque key={i} className="h-9 flex-1 rounded-lg" />)}
      </div>

      <Bloque className="h-48 w-full rounded-2xl" />
    </main>
  )
}
