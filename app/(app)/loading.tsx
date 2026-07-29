import { Bloque, Linea } from '@/components/skeleton/Skeleton'

export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8" role="status" aria-label="Cargando">
      <Linea className="w-40" />
      <div className="space-y-3 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
        <Linea className="w-1/3" />
        <Linea className="w-2/3" />
        <Linea className="w-1/2" />
      </div>
      <div className="space-y-3 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
        <Linea className="w-1/4" />
        <Linea className="w-3/4" />
      </div>
    </main>
  )
}
