'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DOCUMENT_TYPE_LABELS, type DocumentType, type VehicleDocument } from '@/lib/types'

const TYPES = Object.entries(DOCUMENT_TYPE_LABELS) as [DocumentType, string][]

export default function DocumentEditForm({
  vehicleId,
  document,
  onClose,
}: {
  vehicleId: string
  document: VehicleDocument
  onClose: () => void
}) {
  const router = useRouter()
  const [tipo, setTipo] = useState<DocumentType>(document.tipo)
  const [nombrePersonalizado, setNombre] = useState(document.nombrePersonalizado ?? '')
  const [fechaVencimiento, setFecha] = useState(document.fechaVencimiento ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const patch: Record<string, unknown> = {
        tipo,
        nombrePersonalizado: tipo === 'otro' ? nombrePersonalizado : null,
        fechaVencimiento: fechaVencimiento || null,
      }
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
        patch.filePath = fp
        patch.fileUrl = fp
      }
      const update = await fetch(`/api/documents/${document.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!update.ok) throw new Error('update')
      onClose()
      router.refresh()
    } catch {
      setError('No se pudo actualizar el documento.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-lg border p-4">
      <select className="w-full rounded border p-2" value={tipo} onChange={(e) => setTipo(e.target.value as DocumentType)}>
        {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      {tipo === 'otro' && (
        <input className="w-full rounded border p-2" placeholder="Nombre del documento"
          value={nombrePersonalizado} onChange={(e) => setNombre(e.target.value)} required />
      )}
      <label className="block text-sm text-gray-600">Fecha de vencimiento (opcional)</label>
      <input type="date" className="w-full rounded border p-2" value={fechaVencimiento} onChange={(e) => setFecha(e.target.value)} />
      <label className="block text-sm text-gray-600">Reemplazar archivo (opcional)</label>
      <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
          {loading ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button type="button" onClick={onClose} className="rounded border px-4 py-2">Cancelar</button>
      </div>
    </form>
  )
}
