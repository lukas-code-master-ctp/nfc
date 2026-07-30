import { Bloque, Linea } from '@/components/skeleton/Skeleton'

/**
 * Réplica de `VehicleCard`. Copia su estructura responsive, no solo su aspecto:
 * en móvil la tarjeta real APILA el bloque de texto sobre la fila de badges
 * (`flex-col … sm:flex-row`), así que una fantasma en una sola fila mide 78px
 * contra los 108px de la real — 30px por tarjeta, 180px de salto con seis.
 * Alturas medidas en el navegador: texto 24px + 20px, badges 24px, gap 6px.
 */
function TarjetaFantasma() {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-linea bg-superficie p-4 shadow-sm">
      <Bloque className="size-11 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0">
          {/* Los dos <p> reales: base (24px) y text-sm (20px). */}
          <div className="flex h-6 items-center"><Linea className="w-40" /></div>
          <div className="flex h-5 items-center"><Linea className="w-24" /></div>
        </div>
        {/* La fila de badges: 24px de alto, a la izquierda en móvil como la real. */}
        <Bloque className="h-6 w-24 shrink-0 rounded-full sm:w-20" />
      </div>
    </div>
  )
}

export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <p className="sr-only" role="status">Cargando los vehículos</p>

      {/* Encabezado real: h1 text-2xl + subtítulo text-sm + botón, mismo mb-6.
          Sin esto el contenido real llega ~80px más abajo que las tarjetas
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
          {/* Filtros compactos reales (solo mobile, VehiclesBoard.tsx): fila de
              chips (py-1.5 text-sm + borde = 34px, más pb-1 = 38px) + fila de
              selectores (py-1.5 text-sm + borde = 34px), separadas por
              space-y-2 (8px), más el mb-3 final: 38 + 8 + 34 + 12 = 92px
              total. Sin esto el bloque salta ~92px en móvil al cargar. */}
          <Bloque className="mb-3 h-[80px] w-full rounded-lg sm:hidden" />
          <div className="space-y-3">
            {Array.from({ length: 6 }, (_, i) => <TarjetaFantasma key={i} />)}
          </div>
        </div>
      </div>
    </main>
  )
}
