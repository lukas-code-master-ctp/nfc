'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const MARGEN = 8

// Botón "i" con popover. Click para abrir/cerrar; se cierra con click fuera
// o Escape (mejor que :hover para móvil).
export default function InfoTip({ label = 'Más información', children }: { label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  // Corrimiento horizontal para que el popover no se salga de la pantalla.
  // Centrado sobre el botón se desbordaba en móvil (el botón queda cerca del
  // borde derecho) y eso ensanchaba la página con scroll horizontal.
  const [dx, setDx] = useState(0)

  useLayoutEffect(() => {
    if (!open) return
    function ajustar() {
      const el = tipRef.current
      if (!el) return
      // Se mide en la posición base (centrada) para que el cálculo no
      // dependa del corrimiento anterior.
      el.style.transform = 'translateX(-50%)'
      const r = el.getBoundingClientRect()
      const exceso = r.right - (window.innerWidth - MARGEN)
      const d = exceso > 0 ? Math.max(-exceso, MARGEN - r.left) : Math.max(0, MARGEN - r.left)
      // Se escribe también en el DOM: si `d` no cambia respecto al estado
      // anterior no hay re-render y el transform quedaría en la posición base.
      el.style.transform = `translateX(calc(-50% + ${d}px))`
      setDx(d)
    }
    ajustar()
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  }, [open])

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
        onClick={() => {
          setDx(0)
          setOpen((o) => !o)
        }}
        aria-label={label}
        aria-expanded={open}
        className="inline-flex size-4 items-center justify-center rounded-full border border-acero/40 text-[10px] font-bold leading-none text-acero transition-colors hover:border-azul hover:text-azul focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
      >
        i
      </button>
      {open && (
        <div
          ref={tipRef}
          role="tooltip"
          style={{ transform: `translateX(calc(-50% + ${dx}px))` }}
          className="absolute left-1/2 top-6 z-30 w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-linea bg-superficie p-4 text-left shadow-lg"
        >
          {children}
        </div>
      )}
    </span>
  )
}
