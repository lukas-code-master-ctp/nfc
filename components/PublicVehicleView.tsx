import StatusBadge from '@/components/StatusBadge'
import { DOCUMENT_TYPE_LABELS, type VehicleDocument, type Vehicle } from '@/lib/types'
import type { DocStatus } from '@/lib/documents/status'

type Item = VehicleDocument & { status: DocStatus; readUrl: string | null }

const isImage = (path: string) => /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(path)

function CarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-8" aria-hidden="true">
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" /><path d="M9 17h6" /><circle cx="17" cy="17" r="2" />
    </svg>
  )
}

export default function PublicVehicleView({ vehicle, documents }: { vehicle: Vehicle; documents: Item[] }) {
  return (
    <main className="mx-auto min-h-dvh max-w-xl space-y-6 px-4 py-10">
      <div className="flex items-center gap-4 rounded-2xl border border-linea bg-superficie p-6 shadow-sm">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-azul/10 text-azul">
          <CarIcon />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-tinta">
            {vehicle.marca} {vehicle.modelo} · {vehicle.patente}
          </h1>
          <p className="text-base text-acero">{vehicle.anio} · {vehicle.color}</p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-acero">Documentación</h2>
        {documents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-linea bg-superficie/60 px-6 py-10 text-center">
            <p className="text-sm text-acero">Este vehículo no tiene documentos cargados.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {documents.map((d) => {
              const label = d.tipo === 'otro' ? d.nombrePersonalizado : DOCUMENT_TYPE_LABELS[d.tipo]
              return (
                <li key={d.id} className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold text-tinta">{label}</p>
                      <p className="mt-0.5 text-base text-acero">
                        {d.fechaVencimiento ? `Vence el ${d.fechaVencimiento}` : 'Sin vencimiento'}
                      </p>
                    </div>
                    <StatusBadge status={d.status} />
                  </div>

                  <div className="mt-3 border-t border-linea pt-3">
                    {!d.readUrl ? (
                      <p className="flex items-center justify-center gap-2 rounded-lg bg-[#FDF1DC] px-4 py-3 text-base font-medium text-[#B45309]">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                          <path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                        </svg>
                        Sin archivo adjunto
                      </p>
                    ) : isImage(d.filePath) ? (
                      <a href={d.readUrl} target="_blank" rel="noopener noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={d.readUrl}
                          alt={`Documento: ${label}`}
                          loading="lazy"
                          className="max-h-96 w-full rounded-xl border border-linea bg-lienzo object-contain"
                        />
                        <span className="mt-2 block text-center text-sm text-acero">Toca la imagen para ampliar</span>
                      </a>
                    ) : (
                      <a
                        href={d.readUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-azul px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-azul-press"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
                        </svg>
                        Ver documento (PDF)
                      </a>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <p className="pt-2 text-center text-xs text-acero">Ficha de fiscalización · solo lectura</p>
    </main>
  )
}
