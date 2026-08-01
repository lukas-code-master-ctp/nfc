'use client'
import { useEffect, useRef, useState } from 'react'
import { primeraImagen } from '@/lib/documentos/primeraImagen'
import type { Pagina } from '@/lib/documentos/paginas'

export type EstadoLectura = 'no' | 'leyendo' | 'lista'

/**
 * Lee la fecha de vencimiento de la primera página, en segundo plano.
 *
 * **Nunca bloquea nada**: el formulario se puede guardar mientras esto corre, y
 * si no llega nada, se guarda sin fecha como antes.
 *
 * `alLeer` se llama solo cuando hay una fecha; quien la recibe decide qué hacer
 * con ella (en el formulario, escribirla **solo si el campo sigue vacío**).
 */
export function useLecturaFecha(
  primera: Pagina | undefined,
  alLeer: (fecha: string) => void,
): EstadoLectura {
  const [estado, setEstado] = useState<EstadoLectura>('no')
  // Cada lectura lleva su número. Si al volver ya no es la vigente, se descarta:
  // sin esto, cambiar de página deja llegar la respuesta de la anterior y
  // escribe la fecha de otro documento, en silencio.
  const secuencia = useRef(0)
  // El callback en un ref para no reiniciar la lectura cada vez que el padre
  // se vuelve a renderizar con una función nueva. La actualización va en un
  // efecto (sin deps, corre en cada render) y no durante el render mismo:
  // mutar un ref al renderizar es justo lo que ese ref evita necesitar.
  const alLeerRef = useRef(alLeer)
  useEffect(() => {
    alLeerRef.current = alLeer
  })

  const paginaId = primera?.id

  useEffect(() => {
    const mia = ++secuencia.current
    if (!primera) {
      setEstado('no')
      return
    }
    setEstado('leyendo')
    void (async () => {
      try {
        const imagen = await primeraImagen(primera)
        if (mia !== secuencia.current) return
        if (!imagen) {
          setEstado('no')
          return
        }
        const res = await fetch('/api/documents/leer-fecha', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imagen }),
        })
        if (mia !== secuencia.current) return
        const fecha: string | null = res.ok ? ((await res.json())?.fecha ?? null) : null
        if (mia !== secuencia.current) return
        if (fecha) {
          alLeerRef.current(fecha)
          setEstado('lista')
        } else {
          setEstado('no')
        }
      } catch {
        // Best-effort: leer la fecha es un extra. El usuario la escribe a mano.
        if (mia === secuencia.current) setEstado('no')
      }
    })()
    // `primera` se lee adentro pero la dependencia es su id: reordenar o agregar
    // páginas más atrás no debe volver a gastar una lectura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginaId])

  return estado
}
