import Link from 'next/link'
import { planCapacity } from '@/lib/plan'

// Visibilidad del cupo del plan: barra de capacidad + cuántos vehículos
// quedan, y cuando está lleno, un CTA para ampliar el plan.
export default function PlanCapacity({ used, limit }: { used: number; limit: number }) {
  const { remaining, atCapacity, ratio, limit: lim } = planCapacity(used, limit)

  return (
    <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-tinta">Vehículos de tu plan</p>
          <p className="mt-0.5 text-sm text-acero">
            {atCapacity
              ? 'Alcanzaste el límite de tu plan.'
              : `Te ${remaining === 1 ? 'queda' : 'quedan'} ${remaining} ${
                  remaining === 1 ? 'vehículo disponible' : 'vehículos disponibles'
                }.`}
          </p>
        </div>
        <span
          className={`shrink-0 text-sm font-semibold tabular-nums ${atCapacity ? 'text-vencido' : 'text-tinta'}`}
        >
          {used} / {lim}
        </span>
      </div>

      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-lienzo"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={lim}
        aria-valuenow={used}
        aria-label="Vehículos usados de tu plan"
      >
        <div
          className={`h-full rounded-full transition-all ${atCapacity ? 'bg-vencido' : 'bg-azul'}`}
          style={{ width: `${used === 0 ? 0 : Math.max(ratio * 100, 6)}%` }}
        />
      </div>

      {atCapacity && (
        <Link
          href="/facturacion"
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul sm:w-auto"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Ampliar mi plan
        </Link>
      )}
    </section>
  )
}
