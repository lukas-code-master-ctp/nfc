'use client'
import { useEffect } from 'react'

const DURACION_MS = 7000

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

/**
 * Aviso flotante que se cierra solo.
 *
 * Vive en un ancestro que sobreviva a la acción que lo dispara: si lo monta el
 * mismo componente que desaparece al actuar (por ejemplo la tarjeta de
 * onboarding al ocultarse), se desmonta antes de que alguien lo lea.
 *
 * `role="status"` con `aria-live="polite"` para que un lector de pantalla lo
 * anuncie sin interrumpir; no es `alert` porque es informativo, no urgente.
 */
export default function Toast({
  children,
  onCerrar,
  duracionMs = DURACION_MS,
}: {
  children: React.ReactNode
  onCerrar: () => void
  duracionMs?: number
}) {
  useEffect(() => {
    const t = setTimeout(onCerrar, duracionMs)
    return () => clearTimeout(t)
  }, [onCerrar, duracionMs])

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-md items-start gap-3 rounded-xl border border-linea bg-superficie p-4 shadow-lg sm:inset-x-auto sm:right-4"
    >
      <div className="min-w-0 flex-1 text-sm text-tinta">{children}</div>
      <button
        type="button"
        onClick={onCerrar}
        className="shrink-0 cursor-pointer rounded-lg p-1 text-acero hover:bg-lienzo"
      >
        <span className="sr-only">Cerrar aviso</span>
        <CloseIcon className="size-4" />
      </button>
    </div>
  )
}
