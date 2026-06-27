'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import StatusBadge from '@/components/StatusBadge'
import DocumentEditForm from '@/components/DocumentEditForm'
import { DOCUMENT_TYPE_LABELS, type VehicleDocument } from '@/lib/types'
import type { DocStatus } from '@/lib/documents/status'

type Item = VehicleDocument & { status: DocStatus; readUrl: string | null }

export default function DocumentList({ documents, vehicleId }: { documents: Item[]; vehicleId: string }) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)

  async function remove(id: string) {
    if (!confirm('¿Eliminar este documento?')) return
    await fetch(`/api/documents/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  if (documents.length === 0) return <p className="text-gray-500">Sin documentos.</p>

  return (
    <ul className="space-y-2">
      {documents.map((d) => (
        <li key={d.id} className="rounded border p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                {d.tipo === 'otro' ? d.nombrePersonalizado : DOCUMENT_TYPE_LABELS[d.tipo]}
              </p>
              <p className="text-sm text-gray-600">
                {d.fechaVencimiento ? `Vence: ${d.fechaVencimiento}` : 'Sin vencimiento'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={d.status} />
              {d.readUrl && <a href={d.readUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600">Ver</a>}
              <button onClick={() => setEditingId(editingId === d.id ? null : d.id)} className="text-sm text-blue-600">Editar</button>
              <button onClick={() => remove(d.id)} className="text-sm text-red-600">Eliminar</button>
            </div>
          </div>
          {editingId === d.id && (
            <DocumentEditForm vehicleId={vehicleId} document={d} onClose={() => setEditingId(null)} />
          )}
        </li>
      ))}
    </ul>
  )
}
