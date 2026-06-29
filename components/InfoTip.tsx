'use client'
import { useEffect, useRef, useState } from 'react'

// Botón "i" con popover. Click para abrir/cerrar; se cierra con click fuera
// o Escape (mejor que :hover para móvil).
export default function InfoTip({ label = 'Más información', children }: { label?: string; children: React.ReactNode }) {
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
        aria-label={label}
        aria-expanded={open}
        className="inline-flex size-4 items-center justify-center rounded-full border border-acero/40 text-[10px] font-bold leading-none text-acero transition-colors hover:border-azul hover:text-azul focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
      >
        i
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute left-1/2 top-6 z-30 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-linea bg-superficie p-4 text-left shadow-lg"
        >
          {children}
        </div>
      )}
    </span>
  )
}
