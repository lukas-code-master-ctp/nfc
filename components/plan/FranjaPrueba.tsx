import Link from 'next/link'
import type { EstadoPrueba } from '@/lib/plan/prueba'

const TONO: Record<Exclude<EstadoPrueba, 'sin_prueba'>, string> = {
  activa: 'border-azul/30 bg-azul/5 text-acero',
  por_terminar: 'border-por-vencer/40 bg-por-vencer/10 text-tinta',
  vencida: 'border-vencido/40 bg-vencido/10 text-tinta',
}

export default function FranjaPrueba({
  estado,
  diasRestantes,
  destino,
}: {
  estado: EstadoPrueba
  diasRestantes: number | null
  destino: string
}) {
  // Sin fecha no hay plazo que anunciar. Una franja acá sería inventarse uno.
  if (estado === 'sin_prueba') return null

  const dias = diasRestantes ?? 0
  // El destino ya distingue quién eligió plan y quién no (ver dashboard); la
  // etiqueta tiene que decir lo mismo, o quien ya eligió lee "Elegir plan"
  // sobre un botón que en realidad lo manda a ver el plan que ya tiene.
  const etiqueta = destino === '/facturacion' ? 'Ver mi plan' : 'Elegir plan'
  const texto =
    estado === 'vencida'
      ? // Dice la verdad: la app NO se bloquea. Un aviso que amenaza con algo
        // que no ocurre entrena a la gente a ignorar todos los avisos,
        // incluidos los de vencimiento de documentos, que son el producto.
        'Tu prueba terminó. Sigue usando TapCar mientras coordinamos tu plan.'
      : dias === 0
        ? 'Tu prueba termina hoy.'
        : `Estás en la versión de prueba · ${dias === 1 ? 'queda 1 día' : `quedan ${dias} días`}.`

  return (
    <div
      className={`mx-auto flex max-w-2xl flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${TONO[estado]}`}
    >
      <p className="text-sm">{texto}</p>
      <Link
        href={destino}
        className="shrink-0 rounded-lg bg-azul px-3 py-2 text-center text-sm font-medium text-white hover:bg-azul-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
      >
        {etiqueta}
      </Link>
    </div>
  )
}
