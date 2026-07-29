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
    <main className="mx-auto max-w-4xl px-4 py-8">
      <p className="sr-only" role="status">Cargando los vehículos</p>

      {/* Encabezado real: h1 text-2xl + subtítulo text-sm + botón, mismo mb-6.
          Sin esto el contenido real llega ~56px más abajo que las tarjetas
          fantasma y todo salta al cargar. */}
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <Linea className="h-8 w-48" />
          <Linea className="mt-1 h-5 w-40" />
        </div>
        <Bloque className="h-10 w-40 shrink-0 rounded-lg" />
      </div>

      <div className="grid gap-6 sm:grid-cols-[210px_1fr]">
        <aside className="hidden space-y-4 sm:block">
          <Bloque className="h-40 w-full" />
          <Bloque className="h-24 w-full" />
        </aside>
        <div className="min-w-0">
          {/* Buscador real: input py-2.5 text-sm con borde, ~42px, mismo mb-3. */}
          <Bloque className="mb-3 h-[42px] w-full rounded-lg" />
          <div className="space-y-3">
            {Array.from({ length: 6 }, (_, i) => <TarjetaFantasma key={i} />)}
          </div>
        </div>
      </div>
    </main>
  )
}
