import { Bloque, Linea } from '@/components/skeleton/Skeleton'

export default function Loading() {
  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-10" role="status" aria-label="Cargando la transferencia">
      <Linea className="w-32" />
      <Bloque className="h-52 w-full rounded-2xl" />
    </main>
  )
}
