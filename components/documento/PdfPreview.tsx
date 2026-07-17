'use client'
import { useEffect, useRef, useState } from 'react'
import LoadingDots from '@/components/LoadingDots'
import type { PDFDocumentProxy } from 'pdfjs-dist'

type Estado = 'cargando' | 'ok' | 'error'

// Renderiza la primera página de un PDF como imagen inline (un "print"), para que
// en la ficha pública los PDFs se vean como las fotos. Usa pdf.js en el cliente;
// si algo falla, cae al botón de "Ver documento (PDF)".
export default function PdfPreview({ url, label }: { url: string; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [estado, setEstado] = useState<Estado>('cargando')

  useEffect(() => {
    let cancelado = false
    async function render() {
      let pdf: PDFDocumentProxy | null = null
      try {
        // pdfjs referencia APIs de browser: se importa SOLO en el cliente.
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        pdf = await pdfjs.getDocument({ url }).promise
        if (cancelado) return
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 2 })
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) return
        canvas.width = viewport.width
        canvas.height = viewport.height
        if (cancelado) return
        await page.render({ canvasContext: ctx, canvas, viewport }).promise
        if (!cancelado) setEstado('ok')
      } catch {
        if (!cancelado) setEstado('error')
      } finally {
        // Libera el transport y el worker de pdf.js en todos los caminos
        // (éxito, cancelación o error), evitando fugas.
        if (pdf) await pdf.loadingTask.destroy()
      }
    }
    render()
    return () => { cancelado = true }
  }, [url])

  // Fallback: si el render falla, el botón azul de siempre (mismo markup que
  // usaba DocumentosView para los PDFs).
  if (estado === 'error') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-azul px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-azul-press"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
        </svg>
        Ver documento (PDF)
      </a>
    )
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      {estado === 'cargando' && (
        <div className="flex h-40 w-full items-center justify-center gap-2 rounded-xl border border-linea bg-lienzo text-acero">
          <LoadingDots />
          <span className="text-sm">Cargando vista previa…</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        aria-label={`Documento: ${label}`}
        className={`max-h-96 w-full rounded-xl border border-linea bg-lienzo object-contain ${estado === 'ok' ? '' : 'hidden'}`}
      />
      {estado === 'ok' && (
        <span className="mt-2 block text-center text-sm text-acero">Toca para ver el PDF completo</span>
      )}
    </a>
  )
}
