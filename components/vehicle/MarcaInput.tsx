'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { sugerirMarcas } from '@/lib/vehicles/marcas'

/**
 * Campo de marca con sugerencias. **Lista abierta**: sugiere lo que conoce,
 * pero siempre deja escribir una marca que no está — en una flota chilena hay
 * importados y vehículos de trabajo que no van a estar en ninguna lista.
 *
 * Es un combobox propio y no un `<datalist>` nativo porque el nativo no se
 * puede estilizar (la lista la dibuja el sistema operativo) y su filtrado varía
 * por navegador. La app se usa sobre todo desde el celular, y un desplegable
 * del sistema en medio del único formulario de alta desentona con el resto.
 *
 * Controlado por el padre, como `SelectorPaginas`.
 */
export default function MarcaInput({
  value,
  onChange,
  className,
  required,
  placeholder,
}: {
  value: string
  onChange: (valor: string) => void
  className?: string
  required?: boolean
  placeholder?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [resaltada, setResaltada] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const idLista = useId()

  const sugerencias = abierto ? sugerirMarcas(value) : []
  const desplegada = sugerencias.length > 0

  useEffect(() => {
    if (!abierto) return
    function alTocarFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', alTocarFuera)
    return () => document.removeEventListener('mousedown', alTocarFuera)
  }, [abierto])

  function elegir(marca: string) {
    onChange(marca)
    setAbierto(false)
  }

  function alEscribir(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)
    // Volver al principio de la lista: la anterior ya no corresponde a estas
    // sugerencias y el índice podría quedar apuntando fuera.
    setResaltada(0)
    setAbierto(true)
  }

  function alPresionar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setAbierto(false)
      return
    }
    if (!desplegada) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setResaltada((i) => (i + 1) % sugerencias.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setResaltada((i) => (i - 1 + sugerencias.length) % sugerencias.length)
    } else if (e.key === 'Enter') {
      // Sin esto, Enter enviaría el formulario del modal en vez de elegir.
      e.preventDefault()
      elegir(sugerencias[resaltada])
    } else if (e.key === 'Tab') {
      setAbierto(false)
    }
  }

  const idOpcion = (i: number) => `${idLista}-${i}`

  return (
    <div ref={ref} className="relative">
      <input
        role="combobox"
        aria-expanded={desplegada}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={desplegada ? idOpcion(resaltada) : undefined}
        autoComplete="off"
        className={className}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={alEscribir}
        onKeyDown={alPresionar}
      />
      {desplegada && (
        <ul
          id={idLista}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-linea bg-superficie py-1 shadow-lg"
        >
          {sugerencias.map((marca, i) => (
            <li
              key={marca}
              id={idOpcion(i)}
              role="option"
              aria-selected={i === resaltada}
              // onMouseDown y no onClick: el blur del input dispara ANTES que el
              // click, así que con onClick la lista se cierra antes de que la
              // opción reciba el evento y el clic no hace nada.
              onMouseDown={(e) => {
                e.preventDefault()
                elegir(marca)
              }}
              onMouseEnter={() => setResaltada(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === resaltada ? 'bg-azul/10 text-azul' : 'text-tinta'
              }`}
            >
              {marca}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
