'use client'
import { useEffect, useRef, useState } from 'react'

// Pill clickeable con popover. Click para abrir/cerrar; se cierra con click
// fuera o con Escape (mismo patrón que InfoTip, pero el disparador es una pill).
const TONOS = {
  azul: 'bg-azul/10 text-azul',
  rojo: 'bg-[#FCE7E7] text-[#C81E1E]',
} as const

export default function PillTip({
  label,
  tono,
  children,
}: {
  label: string
  tono: keyof typeof TONOS
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`rounded-full px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 ${TONOS[tono]}`}
      >
        {label}
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute right-0 top-6 z-30 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-linea bg-superficie p-3 text-left text-sm text-tinta shadow-lg"
        >
          {children}
        </div>
      )}
    </span>
  )
}
