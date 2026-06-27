import StatusBadge from '@/components/StatusBadge'
import { DOCUMENT_TYPE_LABELS, type VehicleDocument, type Vehicle } from '@/lib/types'
import type { DocStatus } from '@/lib/documents/status'

type Item = VehicleDocument & { status: DocStatus; readUrl: string | null }

export default function PublicVehicleView({ vehicle, documents }: { vehicle: Vehicle; documents: Item[] }) {
  return (
    <main className="mx-auto max-w-xl space-y-6 p-4">
      <div className="rounded-lg border p-4">
        <h1 className="text-2xl font-bold">{vehicle.patente}</h1>
        <p className="text-gray-600">{vehicle.marca} {vehicle.modelo} · {vehicle.anio} · {vehicle.color}</p>
      </div>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Documentación</h2>
        {documents.length === 0 ? (
          <p className="text-gray-500">Este vehículo no tiene documentos cargados.</p>
        ) : (
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
                  {d.readUrl && (
                    <a href={d.readUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600">
                      Ver
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-center text-xs text-gray-400">Ficha de fiscalización · solo lectura</p>
    </main>
  )
}
