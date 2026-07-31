'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const MARGEN = 8

/**
 * Disparador + popover: click para abrir/cerrar, se cierra con click fuera o
 * Escape. Es el comportamiento compartido de `InfoTip` y `PillTip`, extraído
 * porque un `title` **no existe en un celular**: no hay hover, así que el dato
 * que solo vive ahí es invisible para quien usa la app en la calle.
 *
 * El disparador es un `<button>`: eso obliga a que ningún ancestro sea un `<a>`
 * (HTML no permite anidar contenido interactivo). Por eso `VehicleCard` pone su
 * enlace como una capa `absolute inset-0` en vez de envolver la tarjeta entera.
 */
export default function Popover({
  etiqueta,
  claseBoton,
  ariaLabel,
  alineacion = 'derecha',
  children,
}: {
  /** Contenido del botón: el texto de una pill, un punto, un ícono. */
  etiqueta: React.ReactNode
  claseBoton: string
  /** Necesario cuando la etiqueta no es texto legible (un punto de color). */
  ariaLabel?: string
  alineacion?: 'derecha' | 'izquierda'
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  // Corrimiento horizontal para que el popover no se salga de la pantalla. La
  // alineación sola no alcanza: la posición depende de dónde caiga el
  // disparador, y en la tarjeta del dashboard las pills quedan pegadas al borde
  // izquierdo en móvil (medido: el popover asomaba 1px fuera de la pantalla, a
  // un pelo de cortarse de verdad si se agrega una pill más adelante).
  const [dx, setDx] = useState(0)

  useLayoutEffect(() => {
    if (!open) return
    function ajustar() {
      const el = tipRef.current
      if (!el) return
      // Se mide en la posición base para que el cálculo no dependa del
      // corrimiento anterior.
      el.style.transform = 'translateX(0px)'
      const r = el.getBoundingClientRect()
      const exceso = r.right - (window.innerWidth - MARGEN)
      const d = exceso > 0 ? Math.max(-exceso, MARGEN - r.left) : Math.max(0, MARGEN - r.left)
      // Se escribe también en el DOM: si `d` no cambia respecto al estado
      // anterior no hay re-render y el transform quedaría en la posición base.
      el.style.transform = `translateX(${d}px)`
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
        onClick={(e) => {
          // La tarjeta del dashboard tiene un enlace por debajo: sin esto, abrir
          // el popover navegaría a la ficha en el mismo gesto.
          e.preventDefault()
          e.stopPropagation()
          setDx(0)
          setOpen((o) => !o)
        }}
        aria-label={ariaLabel}
        aria-expanded={open}
        className={claseBoton}
      >
        {etiqueta}
      </button>
      {open && (
        <div
          ref={tipRef}
          role="tooltip"
          style={{ transform: `translateX(${dx}px)` }}
          className={`absolute top-6 z-30 w-56 max-w-[calc(100vw-1rem)] rounded-xl border border-linea bg-superficie p-3 text-left text-sm font-normal text-tinta shadow-lg ${
            alineacion === 'derecha' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </div>
      )}
    </span>
  )
}
