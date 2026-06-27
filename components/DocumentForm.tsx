'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DOCUMENT_TYPE_LABELS, type DocumentType } from '@/lib/types'

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
          fechaVencimiento: fechaVencimiento || null,
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

  if (!open) {
    return <button onClick={() => setOpen(true)} className="rounded bg-blue-600 px-4 py-2 text-white">+ Agregar documento</button>
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border p-4">
      <select className="w-full rounded border p-2" value={tipo} onChange={(e) => setTipo(e.target.value as DocumentType)}>
        {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      {tipo === 'otro' && (
        <input className="w-full rounded border p-2" placeholder="Nombre del documento"
          value={nombrePersonalizado} onChange={(e) => setNombre(e.target.value)} required />
      )}
      <label className="block text-sm text-gray-600">Fecha de vencimiento (opcional)</label>
      <input type="date" className="w-full rounded border p-2" value={fechaVencimiento} onChange={(e) => setFecha(e.target.value)} />
      <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
          {loading ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded border px-4 py-2">Cancelar</button>
      </div>
    </form>
  )
}
