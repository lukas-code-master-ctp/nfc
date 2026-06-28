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
            {d.readUrl ? (
              <a href={d.readUrl} target="_blank" rel="noopener noreferrer" className="text-azul hover:text-azul-press">
                Ver archivo
              </a>
            ) : (
              <span className="inline-flex items-center gap-1 text-[#B45309]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
                  <path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                </svg>
                Sin archivo
              </span>
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
