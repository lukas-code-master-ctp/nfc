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

  if (documents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-linea bg-superficie/60 px-6 py-10 text-center">
        <p className="text-sm text-acero">Aún no hay documentos. Agrega el primero con el botón de arriba.</p>
      </div>
    )
  }

  return (
    <ul className="space-y-2.5">
      {documents.map((d) => (
        <li key={d.id} className="rounded-2xl border border-linea bg-superficie p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-tinta">
                {d.tipo === 'otro' ? d.nombrePersonalizado : DOCUMENT_TYPE_LABELS[d.tipo]}
              </p>
              <p className="mt-0.5 text-sm text-acero">
                {d.fechaVencimiento ? `Vence el ${d.fechaVencimiento}` : 'Sin vencimiento'}
              </p>
            </div>
            <StatusBadge status={d.status} />
          </div>
          <div className="mt-3 flex items-center gap-4 border-t border-linea pt-3 text-sm font-medium">
            {d.readUrl && (
              <a href={d.readUrl} target="_blank" rel="noopener noreferrer" className="text-azul hover:text-azul-press">
                Ver archivo
              </a>
            )}
            <button onClick={() => setEditingId(editingId === d.id ? null : d.id)} className="text-azul hover:text-azul-press">
              {editingId === d.id ? 'Cerrar' : 'Editar'}
            </button>
            <button onClick={() => remove(d.id)} className="ml-auto text-vencido hover:text-[#B91C1C]">
              Eliminar
            </button>
          </div>
          {editingId === d.id && (
            <DocumentEditForm vehicleId={vehicleId} document={d} onClose={() => setEditingId(null)} />
          )}
        </li>
      ))}
    </ul>
  )
}
