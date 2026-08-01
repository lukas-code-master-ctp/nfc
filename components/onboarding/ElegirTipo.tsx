'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TipoCuenta } from '@/lib/types'

function AutoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" /><path d="M9 17h6" /><circle cx="17" cy="17" r="2" />
    </svg>
  )
}

function FlotaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="9" height="6" rx="1.5" />
      <rect x="13" y="6" width="9" height="6" rx="1.5" />
      <rect x="2" y="15" width="9" height="6" rx="1.5" />
      <rect x="13" y="15" width="9" height="6" rx="1.5" />
    </svg>
  )
}

export default function ElegirTipo() {
  const router = useRouter()
  const [guardando, setGuardando] = useState<TipoCuenta | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function elegir(tipoCuenta: TipoCuenta) {
    setGuardando(tipoCuenta)
    setError(null)
    // /bienvenida es un embudo obligatorio sin navegación ni menú: si el fetch
    // rechaza (sin conexión, timeout, DNS) en vez de responder !ok, sin este
    // catch el botón queda disabled para siempre y el usuario no tiene salida.
    try {
      const res = await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipoCuenta }),
      })
      if (!res.ok) {
        setGuardando(null)
        setError('No se pudo guardar. Inténtalo de nuevo.')
        return
      }
    } catch {
      setGuardando(null)
      setError('No se pudo guardar. Inténtalo de nuevo.')
      return
    }
    // Al plan y no al dashboard: rebotar por el dashboard solo para que el
    // portero vuelva a mandarte acá es una carga de página regalada.
    router.push('/plan')
    router.refresh()
  }

  const opcion = (
    tipo: TipoCuenta,
    Icono: (p: { className?: string }) => React.ReactElement,
    titulo: string,
    detalle: string,
  ) => (
    <button
      type="button"
      onClick={() => elegir(tipo)}
      disabled={guardando !== null}
      className="flex w-full items-start gap-4 rounded-2xl border border-linea bg-superficie p-5 text-left shadow-sm transition-shadow hover:shadow-md disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-azul/10 text-azul">
        <Icono className="size-6" />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-tinta">{titulo}</span>
        <span className="mt-1 block text-sm text-acero">{detalle}</span>
        {guardando === tipo && <span aria-live="polite" className="mt-2 block text-sm text-azul">Preparando tu cuenta…</span>}
      </span>
    </button>
  )

  return (
    <div className="space-y-3">
      {opcion('personal', AutoIcon, 'Un vehículo particular', 'Guarda tus documentos y recibe avisos antes de que venzan.')}
      {opcion('empresa', FlotaIcon, 'Una flota de la empresa', 'Además: equipo, conductores con PIN, bitácora de uso y pauta de mantención.')}
      {error && <p className="text-sm text-vencido">{error}</p>}
      <p className="text-center text-sm text-acero">
        Si partes con un vehículo particular, más adelante puedes sumar tu flota sin perder nada.
      </p>
    </div>
  )
}
