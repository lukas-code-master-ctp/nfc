import { Bloque, Linea } from '@/components/skeleton/Skeleton'

export default function Loading() {
  return (
    // El role="status" va en el <p className="sr-only">, NO en el <main>:
    // ponerlo en el main reemplaza el landmark y no deja nada anunciable
    // adentro, porque todo lo demás es aria-hidden. Ver Skeleton.tsx.
    <main className="flex min-h-dvh items-center justify-center bg-lienzo p-4">
      <p className="sr-only" role="status">Cargando…</p>
      <div className="w-full max-w-md py-8">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Bloque className="size-14 rounded-2xl" />
          <Linea className="h-8 w-32" />
          <Linea className="mt-2 h-6 w-40" />
          <Linea className="h-4 w-56" />
        </div>
        <div className="space-y-5">
          <div className="flex gap-3">
            <Bloque className="h-20 flex-1 rounded-2xl" />
            <Bloque className="h-20 flex-1 rounded-2xl" />
          </div>
          <Bloque className="h-11 w-full rounded-xl" />
          <Bloque className="h-44 w-full rounded-2xl" />
          <Bloque className="h-12 w-full rounded-xl" />
          <div className="flex justify-center">
            <Linea className="h-4 w-64" />
          </div>
        </div>
      </div>
    </main>
  )
}
