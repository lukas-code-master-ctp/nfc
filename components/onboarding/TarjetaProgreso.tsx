'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { primerPendiente, type Paso } from '@/lib/onboarding/pasos'
import type { TipoCuenta } from '@/lib/types'

// Dinámico a propósito: los cinco mockups animados y sus textos viven en su
// propio chunk, fuera del bundle del dashboard. Como la ayuda arranca abierta,
// ese chunk se pide al renderizar la tarjeta —no antes— y nunca para quien ya
// terminó el onboarding, que no la ve.
const AyudaPaso = dynamic(() => import('@/components/onboarding/AyudaPaso'))

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 13 4 4L19 7" />
    </svg>
  )
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export default function TarjetaProgreso({
  pasos,
  tipoCuenta,
  onNuevoVehiculo,
  onOcultada,
}: {
  pasos: Paso[]
  tipoCuenta: TipoCuenta
  /** El paso "vehiculo" abre el modal de alta en vez de enlazar: sin vehículos
   *  no hay ficha a la que ir, así que un `<a href="/dashboard">` dentro del
   *  propio dashboard solo hace scroll al tope. */
  onNuevoVehiculo?: () => void
  /** Se llama solo si ocultar se guardó bien. El aviso de que la guía se puede
   *  reabrir desde Configuración lo monta el padre, no esta tarjeta: al
   *  ocultarse, el servidor deja de renderizarla y un aviso propio se
   *  desmontaría antes de que alguien lo lea. */
  onOcultada?: () => void
}) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  // Contraída por defecto: con nueve pasos la lista completa empuja la flota
  // fuera de la pantalla, y el dashboard es para ver la flota.
  const [abierta, setAbierta] = useState(false)
  // La ayuda arranca DESPLEGADA: es lo que enseña el paso, y esconderla detrás
  // de un clic extra hacía que casi nadie la viera. Por eso el estado guarda
  // los pasos que el usuario CERRÓ, no los que abrió. Independientes entre sí:
  // cerrar uno al abrir otro sorprende más de lo que ordena.
  const [ayudaCerrada, setAyudaCerrada] = useState<string[]>([])
  const ayudaAbierta = (id: string) => !ayudaCerrada.includes(id)
  const alternarAyuda = (id: string) =>
    setAyudaCerrada((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const hechos = pasos.filter((p) => p.listo).length
  const pendiente = primerPendiente(pasos)
  // Sin pendientes no hay nada que contraer (render transitorio antes de que
  // `completadoEn` esconda la tarjeta): se muestra la lista entera.
  const visibles = abierta || !pendiente ? pasos : [pendiente]

  async function patch(body: Record<string, unknown>, alGuardar?: () => void) {
    setOcupado(true)
    // Si el fetch rechaza (sin conexión, timeout, DNS — común en celular) el
    // catch libera "ocupado" igual que el camino !ok, para que los botones no
    // queden inhabilitados para siempre y el usuario pueda reintentar.
    try {
      const res = await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setOcupado(false)
      if (res.ok) {
        alGuardar?.()
        router.refresh()
      }
    } catch {
      setOcupado(false)
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-tinta">Configura tu cuenta</h2>
          <p className="mt-0.5 text-sm text-acero">
            <span className="font-medium text-tinta">{hechos} de {pasos.length}</span> · Puedes hacerlo cuando quieras.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {pendiente && (
            <button
              type="button"
              onClick={() => setAbierta((v) => !v)}
              aria-expanded={abierta}
              aria-controls="onboarding-pasos"
              className="cursor-pointer rounded-lg p-1 text-acero hover:bg-lienzo"
            >
              <span className="sr-only">{abierta ? 'Ver solo el paso actual' : 'Ver todos los pasos'}</span>
              <ChevronIcon className={`size-5 transition-transform ${abierta ? 'rotate-180' : ''}`} />
            </button>
          )}
          <button
            type="button"
            onClick={() => patch({ descartado: true }, onOcultada)}
            disabled={ocupado}
            className="cursor-pointer rounded-lg px-2 py-1 text-sm text-acero hover:bg-lienzo disabled:opacity-60"
          >
            Ocultar
          </button>
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-lienzo" aria-hidden="true">
        <div className="h-full rounded-full bg-azul transition-all" style={{ width: `${(hechos / pasos.length) * 100}%` }} />
      </div>

      <ul id="onboarding-pasos" className="mt-4 space-y-1">
        {visibles.map((p) => (
          <li key={p.id} className="flex items-start gap-3 rounded-xl px-2 py-2">
            <span
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                p.listo ? 'border-vigente bg-vigente text-white' : 'border-linea text-transparent'
              }`}
              aria-hidden="true"
            >
              <CheckIcon className="size-3" />
            </span>
            <div className="min-w-0 flex-1">
              {p.listo ? (
                <p className="text-sm font-medium text-acero line-through">{p.titulo}</p>
              ) : (
                <>
                  <div className="flex items-start gap-1.5">
                    {p.id === 'vehiculo' && onNuevoVehiculo ? (
                      <button
                        type="button"
                        onClick={onNuevoVehiculo}
                        className="cursor-pointer text-left text-sm font-medium text-azul hover:underline"
                      >
                        {p.titulo}
                      </button>
                    ) : p.href === null ? (
                      <p className="text-sm font-medium text-tinta">{p.titulo}</p>
                    ) : (
                      <Link href={p.href} className="text-sm font-medium text-azul hover:underline">
                        {p.titulo}
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => alternarAyuda(p.id)}
                      aria-expanded={ayudaAbierta(p.id)}
                      className="-mt-0.5 shrink-0 cursor-pointer rounded p-0.5 text-acero hover:bg-lienzo"
                    >
                      <span className="sr-only">
                        {ayudaAbierta(p.id) ? `Ocultar cómo hacerlo: ${p.titulo}` : `Ver cómo hacerlo: ${p.titulo}`}
                      </span>
                      <ChevronIcon className={`size-4 transition-transform ${ayudaAbierta(p.id) ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  <p className="mt-0.5 text-sm text-acero">{p.detalle}</p>
                  {ayudaAbierta(p.id) && <AyudaPaso pasoId={p.id} />}
                  {p.informativo && (
                    <button
                      type="button"
                      onClick={() => patch({ visto: p.id })}
                      disabled={ocupado}
                      className="mt-1.5 rounded-lg border border-linea px-2.5 py-1 text-xs font-medium text-acero hover:bg-lienzo disabled:opacity-60"
                    >
                      Entendido
                    </button>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {tipoCuenta === 'personal' && (
        <button
          type="button"
          onClick={() => patch({ tipoCuenta: 'empresa' })}
          disabled={ocupado}
          className="mt-3 text-sm text-acero underline hover:text-tinta disabled:opacity-60"
        >
          En realidad administro una flota
        </button>
      )}
    </section>
  )
}
