'use client'
import { useRouter } from 'next/navigation'
import StatusBadge from '@/components/StatusBadge'
import { DOCUMENT_TYPE_LABELS, type VehicleDocument } from '@/lib/types'
import type { DocStatus } from '@/lib/documents/status'

type Item = VehicleDocument & { status: DocStatus; readUrl: string | null }

export default function DocumentList({ documents }: { documents: Item[] }) {
  const router = useRouter()

  async function remove(id: string) {
    if (!confirm('¿Eliminar este documento?')) return
    await fetch(`/api/documents/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  if (documents.length === 0) return <p className="text-gray-500">Sin documentos.</p>

  return (
    <ul className="space-y-2">
      {documents.map((d) => (
        <li key={d.id} className="flex items-center justify-between rounded border p-3">
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
            {d.readUrl && <a href={d.readUrl} target="_blank" className="text-sm text-blue-600">Ver</a>}
            <button onClick={() => remove(d.id)} className="text-sm text-red-600">Eliminar</button>
          </div>
        </li>
      ))}
    </ul>
  )
}
