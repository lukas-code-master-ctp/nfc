'use client'
import { useEffect, useRef, useState } from 'react'
import { primeraImagen } from '@/lib/documentos/primeraImagen'
import type { Pagina } from '@/lib/documentos/paginas'

export type EstadoLectura = 'no' | 'leyendo' | 'lista'

export type ManejadoresLecturaFecha = {
  /**
   * Se llama al empezar una lectura nueva (cambió la primera página, o se agregó
   * la primera), ANTES de pedir nada. Es el único punto donde se sabe con
   * certeza que toca descartar la fecha que puso una lectura anterior: el
   * formulario decide qué hacer (borrar el campo solo si lo que hay lo puso la
   * IA, nunca si lo escribió el usuario).
   */
  alEmpezar: () => void
  /**
   * Se llama solo cuando el modelo devolvió una fecha. Devuelve si se aplicó de
   * verdad — el formulario puede rechazarla (ej. el usuario ya tocó el campo) —
   * y ese booleano es lo que decide si el estado pasa a `'lista'`: el aviso
   * "Fecha leída del documento" no puede afirmar algo que no ocurrió.
   */
  alLeer: (fecha: string) => boolean
}

/**
 * Lee la fecha de vencimiento de la primera página, en segundo plano.
 *
 * **Nunca bloquea nada**: el formulario se puede guardar mientras esto corre, y
 * si no llega nada, se guarda sin fecha como antes.
 */
export function useLecturaFecha(
  primera: Pagina | undefined,
  manejadores: ManejadoresLecturaFecha,
): EstadoLectura {
  const [estado, setEstado] = useState<EstadoLectura>('no')
  // Cada lectura lleva su número. Si al volver ya no es la vigente, se descarta:
  // sin esto, cambiar de página deja llegar la respuesta de la anterior y
  // escribe la fecha de otro documento, en silencio.
  const secuencia = useRef(0)
  // Los manejadores en un ref para no reiniciar la lectura cada vez que el
  // padre se vuelve a renderizar con funciones nuevas. La actualización va en
  // un efecto (sin deps, corre en cada render) y no durante el render mismo:
  // mutar un ref al renderizar es justo lo que ese ref evita necesitar.
  const manejadoresRef = useRef(manejadores)
  useEffect(() => {
    manejadoresRef.current = manejadores
  })

  const paginaId = primera?.id

  useEffect(() => {
    const mia = ++secuencia.current
    // Un `AbortController` por lectura: sin esto, cambiar de página descarta el
    // RESULTADO de la petición vieja (por la secuencia) pero la petición misma
    // sigue viva hasta el final y se paga igual. N cambios de foto son N
    // llamadas pagadas en paralelo. Abortar en el cleanup cierra además el
    // hallazgo de que el hook no cancelaba nada al desmontarse.
    const controlador = new AbortController()

    // Arranca una lectura nueva (incluida la transición a "sin página"): es el
    // único momento en que hay que avisar que se descarte lo que puso la IA.
    manejadoresRef.current.alEmpezar()

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
          signal: controlador.signal,
        })
        if (mia !== secuencia.current) return
        const fecha: string | null = res.ok ? ((await res.json())?.fecha ?? null) : null
        if (mia !== secuencia.current) return
        if (fecha) {
          // El formulario decide si se aplica de verdad (ej. campo ya tocado
          // por el usuario): el estado solo afirma lo que pasó.
          const aplicada = manejadoresRef.current.alLeer(fecha)
          setEstado(aplicada ? 'lista' : 'no')
        } else {
          setEstado('no')
        }
      } catch {
        // Best-effort: leer la fecha es un extra. Incluye el rechazo de `fetch`
        // por el abort, que nunca debe volverse un error visible.
        if (mia === secuencia.current) setEstado('no')
      }
    })()

    return () => controlador.abort()
    // `primera` se lee adentro pero la dependencia es su id: reordenar o agregar
    // páginas más atrás no debe volver a gastar una lectura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginaId])

  return estado
}
