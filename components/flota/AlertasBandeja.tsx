import type { Alerta } from '@/lib/types'
import AtenderAlertaButton from '@/components/flota/AtenderAlertaButton'

function fecha(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
}

const LABEL: Record<Alerta['tipo'], string> = { dano: 'Daño reportado', sin_entrega: 'Sin entrega formal' }

export default function AlertasBandeja({ alertas, puedeAtender }: { alertas: Alerta[]; puedeAtender: boolean }) {
  return (
    <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Pendientes</h2>
      <p className="mt-1 text-sm text-acero">Daños y entregas sin cerrar que requieren atención.</p>
      {alertas.length === 0 ? (
        <p className="mt-4 text-sm text-acero">No hay alertas pendientes.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {alertas.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-linea px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-tinta">{a.patente} · {LABEL[a.tipo]}</p>
                <p className="text-xs text-acero">
                  {a.driverNombre} · {fecha(a.creadaEn)}{a.nota ? ` · ${a.nota}` : ''}
                </p>
              </div>
              {puedeAtender && <AtenderAlertaButton alertaId={a.id} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
