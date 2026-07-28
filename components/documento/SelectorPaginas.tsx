'use client'
import { useEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { MAX_PAGINAS, cabenPaginas, esImagen, type Pagina } from '@/lib/documentos/paginas'

/**
 * Cada miniatura revoca su propio objectURL al desmontarse (al borrarla o al cerrar
 * el formulario). Las keys son el id de la página, así que reordenar no desmonta nada.
 */
function Miniatura({
  pagina,
  indice,
  total,
  conError,
  onQuitar,
  onMover,
}: {
  pagina: Pagina
  indice: number
  total: number
  conError: boolean
  onQuitar: () => void
  onMover: (delta: number) => void
}) {
  useEffect(() => () => URL.revokeObjectURL(pagina.url), [pagina.url])

  const flecha = 'flex size-7 items-center justify-center rounded-md border border-linea bg-superficie text-acero disabled:opacity-30'

  return (
    <li className={`rounded-xl border p-2 ${conError ? 'border-vencido bg-[#FCE7E7]' : 'border-linea bg-superficie'}`}>
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-lienzo">
        {esImagen(pagina.file.type) ? (
          <img src={pagina.url} alt={`Página ${indice + 1}`} className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1.5 p-2 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-7 text-acero" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6" />
            </svg>
            <span className="break-all text-[11px] leading-tight text-acero">{pagina.file.name}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar página ${indice + 1}`}
          className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-tinta/70 text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="size-3.5" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {conError && (
        <p className="mt-1.5 text-[11px] leading-tight text-vencido">
          No pudimos leer esta foto. Bórrala y sácala de nuevo.
        </p>
      )}

      <div className="mt-1.5 flex items-center justify-between">
        <button type="button" onClick={() => onMover(-1)} disabled={indice === 0} className={flecha} aria-label={`Mover página ${indice + 1} a la izquierda`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span className="text-xs font-medium text-acero">{indice + 1}</span>
        <button type="button" onClick={() => onMover(1)} disabled={indice === total - 1} className={flecha} aria-label={`Mover página ${indice + 1} a la derecha`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
    </li>
  )
}

export default function SelectorPaginas({
  paginas,
  onChange,
  paginaConError,
}: {
  paginas: Pagina[]
  onChange: (p: Pagina[]) => void
  paginaConError?: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Un PDF va solo: mezclarlo con fotos obligaría a rasterizarlo.
  const hayPdf = paginas.some((p) => !esImagen(p.file.type))
  const lleno = hayPdf || paginas.length >= MAX_PAGINAS

  function nueva(file: File): Pagina {
    return { id: nanoid(8), file, url: URL.createObjectURL(file) }
  }

  function agregar(lista: FileList | File[] | null) {
    const elegidos = lista ? Array.from(lista) : []
    if (elegidos.length === 0) return

    const pdf = elegidos.find((f) => !esImagen(f.type))
    if (pdf) {
      onChange([nueva(pdf)])
      setAviso(elegidos.length > 1 ? 'Un PDF se sube solo, sin más páginas.' : null)
      return
    }

    const { acepta, rechaza } = cabenPaginas(paginas.length, elegidos.length)
    onChange([...paginas, ...elegidos.slice(0, acepta).map(nueva)])
    setAviso(
      rechaza > 0
        ? `Se agregaron ${acepta} y ${rechaza} quedaron fuera: el máximo es ${MAX_PAGINAS} páginas.`
        : null,
    )
  }

  function quitar(id: string) {
    onChange(paginas.filter((p) => p.id !== id))
    setAviso(null)
  }

  function mover(i: number, delta: number) {
    const j = i + delta
    if (j < 0 || j >= paginas.length) return
    const copia = [...paginas]
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
    onChange(copia)
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          agregar(e.target.files)
          // Sin esto, volver a elegir el mismo archivo no dispara el change.
          e.target.value = ''
        }}
      />

      {paginas.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {paginas.map((p, i) => (
            <Miniatura
              key={p.id}
              pagina={p}
              indice={i}
              total={paginas.length}
              conError={paginaConError === p.id}
              onQuitar={() => quitar(p.id)}
              onMover={(d) => mover(i, d)}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={lleno}
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-linea bg-lienzo px-4 py-3 text-sm font-medium text-azul transition-colors hover:bg-azul/5 disabled:cursor-not-allowed disabled:text-acero disabled:hover:bg-lienzo"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {paginas.length === 0 ? 'Agregar archivo o foto' : 'Agregar otra página'}
      </button>

      {paginas.length > 0 && !hayPdf && (
        <p className="text-xs text-acero">
          {paginas.length} de {MAX_PAGINAS} páginas
          {paginas.length > 1 && ' · se subirán como un solo PDF, en este orden'}
        </p>
      )}
      {paginas.length === 0 && (
        <p className="text-xs text-acero">
          Puedes sacar varias fotos, una por cada cara del documento, y se guardan en un solo archivo.
        </p>
      )}
      {aviso && <p className="text-xs text-ambar">{aviso}</p>}
    </div>
  )
}
