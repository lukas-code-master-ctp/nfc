'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  cargoDe,
  ahorroAnual,
  tagIncluded,
  formatCLP,
  FREE_TAG_THRESHOLD,
  TAG_PRICE,
  MAX_VEHICULOS_SELF_SERVICE,
} from '@/lib/billing'
import type { Periodicidad } from '@/lib/types'

const ATAJOS = [1, 3, 5, 10]

export default function SelectorPlan({ inicial }: { inicial: number }) {
  const router = useRouter()
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>('mensual')
  const [vehiculos, setVehiculos] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const excede = vehiculos > MAX_VEHICULOS_SELF_SERVICE
  const cargo = cargoDe({ vehiculos, periodicidad })
  const ahorro = ahorroAnual(vehiculos)

  function cambiar(n: number) {
    // Se deja escribir por encima del tope para poder mostrar la salida a
    // Facturación en vez de un error mudo.
    setVehiculos(Math.min(99, Math.max(1, Math.floor(n) || 1)))
  }

  async function continuar() {
    setGuardando(true)
    setError(null)
    // /plan es un embudo obligatorio sin navegación: si el fetch rechaza (sin
    // conexión, timeout, DNS) en vez de responder !ok, sin este catch el botón
    // queda disabled para siempre y el usuario no tiene salida.
    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodicidad, maxVehiculos: vehiculos }),
      })
      if (!res.ok) {
        setGuardando(false)
        setError('No se pudo guardar. Inténtalo de nuevo.')
        return
      }
    } catch {
      setGuardando(false)
      setError('No se pudo guardar. Inténtalo de nuevo.')
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  const tarjeta = (valor: Periodicidad, titulo: string, detalle: string, pill?: string) => (
    <button
      type="button"
      onClick={() => setPeriodicidad(valor)}
      aria-pressed={periodicidad === valor}
      className={`flex-1 rounded-2xl border p-4 text-left transition-shadow ${
        periodicidad === valor
          ? 'border-azul bg-azul/5 shadow-sm'
          : 'border-linea bg-superficie hover:shadow-sm'
      } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul`}
    >
      <span className="flex items-center gap-2">
        <span className="font-semibold text-tinta">{titulo}</span>
        {pill && (
          <span className="rounded-full bg-vigente/15 px-2 py-0.5 text-xs font-medium text-vigente">
            {pill}
          </span>
        )}
      </span>
      <span className="mt-1 block text-sm text-acero">{detalle}</span>
    </button>
  )

  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-2 text-sm font-medium text-acero">¿Cómo prefieres pagar?</h2>
        <div className="flex gap-3">
          {tarjeta('mensual', 'Mensual', 'Se cobra todos los meses.')}
          {tarjeta('anual', 'Anual', 'Un pago al año.', '−35%')}
        </div>
      </div>

      <div>
        <label htmlFor="vehiculos" className="mb-2 block text-sm font-medium text-acero">
          ¿Cuántos vehículos vas a registrar?
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => cambiar(vehiculos - 1)}
            aria-label="Quitar un vehículo"
            className="size-11 shrink-0 rounded-xl border border-linea bg-superficie text-lg font-medium text-tinta hover:bg-lienzo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
          >
            −
          </button>
          <input
            id="vehiculos"
            type="number"
            min={1}
            inputMode="numeric"
            value={vehiculos}
            onChange={(e) => cambiar(Number(e.target.value))}
            className="w-20 rounded-xl border border-linea bg-superficie px-3 py-2.5 text-center text-lg font-semibold text-tinta tabular-nums focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
          />
          <button
            type="button"
            onClick={() => cambiar(vehiculos + 1)}
            aria-label="Agregar un vehículo"
            className="size-11 shrink-0 rounded-xl border border-linea bg-superficie text-lg font-medium text-tinta hover:bg-lienzo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
          >
            +
          </button>
          <div className="ml-1 flex gap-1.5">
            {ATAJOS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => cambiar(n)}
                className="rounded-lg border border-linea bg-superficie px-2.5 py-1.5 text-sm text-acero hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-acero">Tu plan</span>
          <span className="text-right">
            <span className="block text-2xl font-bold tracking-tight text-tinta">
              {formatCLP(cargo.monto)}
            </span>
            <span className="text-xs text-acero">
              {periodicidad === 'anual' ? 'una vez al año' : 'al mes'}
            </span>
          </span>
        </div>
        <dl className="mt-4 space-y-2 border-t border-linea pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-acero">Valor por vehículo</dt>
            <dd className="font-medium text-tinta tabular-nums">
              {formatCLP(cargo.porVehiculo)} / {cargo.unidad}
            </dd>
          </div>
          {periodicidad === 'anual' && (
            <div className="flex justify-between gap-4">
              <dt className="text-acero">Ahorras al año</dt>
              <dd className="font-medium text-vigente tabular-nums">{formatCLP(ahorro)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-acero">Chip NFC</dt>
            <dd className="text-right font-medium text-tinta">
              {tagIncluded(vehiculos)
                ? 'Incluido (pagas el envío)'
                : `${formatCLP(TAG_PRICE)} + envío c/u`}
            </dd>
          </div>
        </dl>
        {!tagIncluded(vehiculos) && (
          <p className="mt-3 text-xs text-acero">
            Desde {FREE_TAG_THRESHOLD} vehículos el chip va incluido.
          </p>
        )}
      </div>

      {excede ? (
        <div className="space-y-3 rounded-2xl border border-linea bg-azul/5 p-5">
          <p className="text-sm text-acero">
            Para flotas de más de {MAX_VEHICULOS_SELF_SERVICE} vehículos coordinamos el plan
            contigo directamente.
          </p>
          <Link
            href="/facturacion"
            className="block w-full rounded-xl bg-azul px-4 py-3 text-center font-medium text-white hover:bg-azul-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
          >
            Hablemos de tu flota
          </Link>
        </div>
      ) : (
        <button
          type="button"
          onClick={continuar}
          disabled={guardando}
          className="w-full rounded-xl bg-azul px-4 py-3 font-medium text-white hover:bg-azul-press disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
        >
          {guardando ? 'Preparando tu cuenta…' : 'Continuar'}
        </button>
      )}

      {error && <p className="text-sm text-vencido">{error}</p>}

      <p className="text-center text-sm text-acero">
        Empiezas con 30 días de prueba. Coordinamos el pago contigo antes de que terminen.
      </p>
    </div>
  )
}
