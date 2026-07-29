import { Bloque, Linea } from '@/components/skeleton/Skeleton'
import { TapCarLockup } from '@/components/brand/Logo'

export default function Loading() {
  return (
    <main className="mx-auto min-h-dvh max-w-xl space-y-6 px-4 py-10" role="status" aria-label="Cargando el vehículo">
      {/* El logo se pinta de verdad: es lo único que ya sabemos, y ancla la pantalla. */}
      <div className="flex justify-center">
        <TapCarLockup iconClassName="size-6" wordClassName="text-lg" />
      </div>

      <div className="flex items-center gap-4 rounded-2xl border border-linea bg-superficie p-6 shadow-sm">
        <Bloque className="size-14 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <Linea className="h-4 w-3/5" />
          <Linea className="w-2/5" />
        </div>
      </div>

      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => <Bloque key={i} className="h-20 w-full rounded-2xl" />)}
      </div>
    </main>
  )
}
