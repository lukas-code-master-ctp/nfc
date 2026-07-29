import { Bloque, Linea } from '@/components/skeleton/Skeleton'

export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <p className="sr-only" role="status">Cargando las empresas</p>
      <Linea className="mb-6 w-40" />
      <Bloque className="h-64 w-full rounded-2xl" />
    </main>
  )
}
