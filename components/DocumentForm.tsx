'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DOCUMENT_TYPE_LABELS, tipoTieneVencimiento, type DocumentType } from '@/lib/types'

const TYPES = Object.entries(DOCUMENT_TYPE_LABELS) as [DocumentType, string][]

export default function DocumentForm({ vehicleId }: { vehicleId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<DocumentType>('permiso_circulacion')
  const [nombrePersonalizado, setNombre] = useState('')
  const [fechaVencimiento, setFecha] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      let fileUrl = ''
      let filePath = ''
      if (file) {
        const res = await fetch('/api/documents/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleId, fileName: file.name, contentType: file.type }),
        })
        if (!res.ok) throw new Error('upload-url')
        const { uploadUrl, filePath: fp } = await res.json()
        const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
        if (!put.ok) throw new Error('upload')
        filePath = fp
        fileUrl = fp
      }
      const create = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId, tipo,
          nombrePersonalizado: tipo === 'otro' ? nombrePersonalizado : null,
          fechaVencimiento: tipoTieneVencimiento(tipo) ? fechaVencimiento || null : null,
          fileUrl, filePath,
        }),
      })
      if (!create.ok) throw new Error('create')
      setOpen(false)
      setFile(null); setFecha(''); setNombre('')
      router.refresh()
    } catch {
      setError('No se pudo agregar el documento.')
    } finally {
      setLoading(false)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'
  const labelCls = 'block text-sm font-medium text-acero'

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Agregar documento
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <div className="space-y-1.5">
        <label className={labelCls}>Tipo de documento</label>
        <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value as DocumentType)}>
          {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {tipo === 'otro' && (
        <input className={inputCls} placeholder="Nombre del documento"
          value={nombrePersonalizado} onChange={(e) => setNombre(e.target.value)} required />
      )}
      {tipoTieneVencimiento(tipo) && (
        <div className="space-y-1.5">
          <label className={labelCls}>Fecha de vencimiento <span className="font-normal text-acero/70">(opcional)</span></label>
          <input type="date" className={inputCls} value={fechaVencimiento} onChange={(e) => setFecha(e.target.value)} />
        </div>
      )}
      <div className="space-y-1.5">
        <label className={labelCls}>Archivo del documento</label>
        <input type="file" accept="application/pdf,image/*" required onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-acero file:mr-3 file:rounded-lg file:border-0 file:bg-azul/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-azul hover:file:bg-azul/15" />
        <p className="text-xs text-acero">Sube la foto o PDF del documento para que pueda validarse en una fiscalización.</p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-[#FCE7E7] px-3 py-2 text-sm text-[#C81E1E]">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading}
          className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50">
          {loading ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="rounded-lg border border-linea bg-superficie px-4 py-2.5 text-sm font-medium text-tinta transition-colors hover:bg-lienzo">
          Cancelar
        </button>
      </div>
    </form>
  )
}
