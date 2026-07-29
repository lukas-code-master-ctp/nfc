import { Bloque, Linea } from '@/components/skeleton/Skeleton'

export default function Loading() {
  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-10">
      <p className="sr-only" role="status">Cargando la transferencia</p>
      <Linea className="w-32" />
      <Bloque className="h-52 w-full rounded-2xl" />
    </main>
  )
}
