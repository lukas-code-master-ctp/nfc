import Link from 'next/link'
import type { EstadoPrueba } from '@/lib/plan/prueba'

const TONO: Record<Exclude<EstadoPrueba, 'sin_prueba'>, string> = {
  activa: 'border-azul/30 bg-azul/5 text-acero',
  por_terminar: 'border-por-vencer/40 bg-por-vencer/10 text-tinta',
  vencida: 'border-vencido/40 bg-vencido/10 text-tinta',
}

/**
 * `hasta` es una fecha calendario `YYYY-MM-DD`, no un instante: se arma por
 * componentes en vez de parsearla como ISO, por el mismo motivo que el
 * `fechaCL` de `/facturacion` (evita el desfase de huso horario de
 * `toLocaleDateString` sobre una medianoche UTC vista desde Chile).
 */
function fechaCL(fechaISO: string): string {
  const [y, m, d] = fechaISO.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function RelojIcon() {
  return (
    <svg
      className="size-5 shrink-0 opacity-70"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

// Ancho completo y `mb-6`, igual que `TransferenciasEntrantes`, que es el otro
// banner de este mismo board: con `max-w-2xl` centrada era el único elemento
// con un ancho distinto al del contenedor (`max-w-4xl`), así que quedaba
// flotando entre el sidebar y la lista sin alinearse con ninguno de los dos.
const MARCO =
  'mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3'

export default function FranjaPrueba({
  estado,
  diasRestantes,
  destino,
  promo = null,
}: {
  estado: EstadoPrueba
  diasRestantes: number | null
  destino: string
  /**
   * Promoción VIGENTE (fase `promo` de `lib/plan/fase.ts`), o `null` si no
   * hay una corriendo. `prueba` y `promo` son fases mutuamente excluyentes:
   * si esto llega no-null es porque la prueba YA terminó y hay cobertura
   * corriendo. Decirle a ese usuario "tu prueba terminó" sería falso —
   * /facturacion en ese mismo momento le muestra "Promoción hasta el …" — y
   * sumarle además la cuenta regresiva de la prueba sería una urgencia
   * inventada sobre un plazo que ya no aplica.
   */
  promo?: { diasRestantes: number; hasta: string } | null
}) {
  // El destino ya distingue quién eligió plan y quién no (ver dashboard); la
  // etiqueta tiene que decir lo mismo, o quien ya eligió lee "Elegir plan"
  // sobre un botón que en realidad lo manda a ver el plan que ya tiene.
  const etiqueta = destino === '/facturacion' ? 'Ver mi plan' : 'Elegir plan'

  if (promo) {
    const dias = Math.max(0, promo.diasRestantes)
    const texto =
      dias === 0
        ? `Tu promoción termina hoy · hasta el ${fechaCL(promo.hasta)}.`
        : `Tienes una promoción activa · ${dias === 1 ? 'queda 1 día' : `quedan ${dias} días`} · hasta el ${fechaCL(promo.hasta)}.`

    return (
      <div className={`${MARCO} border-azul/30 bg-azul/5 text-acero`}>
        <p className="flex min-w-0 items-center gap-2.5 text-sm">
          <RelojIcon />
          <span>{texto}</span>
        </p>
        <Link
          href={destino}
          className="shrink-0 rounded-lg bg-azul px-3 py-2 text-center text-sm font-medium text-white hover:bg-azul-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
        >
          {etiqueta}
        </Link>
      </div>
    )
  }

  // Sin fecha no hay plazo que anunciar. Una franja acá sería inventarse uno.
  if (estado === 'sin_prueba') return null

  const dias = diasRestantes ?? 0
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
    <div className={`${MARCO} ${TONO[estado]}`}>
      <p className="flex min-w-0 items-center gap-2.5 text-sm">
        <RelojIcon />
        <span>{texto}</span>
      </p>
      <Link
        href={destino}
        className="shrink-0 rounded-lg bg-azul px-3 py-2 text-center text-sm font-medium text-white hover:bg-azul-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
      >
        {etiqueta}
      </Link>
    </div>
  )
}
