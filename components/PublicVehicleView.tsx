'use client'
import { useState } from 'react'
import StatusBadge from '@/components/StatusBadge'
import { TapCarLockup } from '@/components/brand/Logo'
import UsoPanel from '@/components/uso/UsoPanel'
import {
  DOCUMENT_TYPE_LABELS,
  VEHICLE_INFO_FIELDS,
  type VehicleDocument,
  type Vehicle,
  type DanoActivo,
} from '@/lib/types'
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

function DocumentosView({ documents }: { documents: Item[] }) {
  return (
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
  )
}

function SobreVehiculoView({ vehicle }: { vehicle: Vehicle }) {
  const info = vehicle.info ?? {}
  const filled = VEHICLE_INFO_FIELDS.filter((f) => (info[f.key] ?? '').trim())
  const rows = filled.filter((f) => !f.multiline)
  const notas = filled.find((f) => f.multiline)

  return (
    <section className="space-y-3">
      <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-acero">Sobre el vehículo</h2>
      {filled.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-linea bg-superficie/60 px-6 py-10 text-center">
          <p className="text-sm text-acero">El dueño aún no agregó información de este vehículo.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.length > 0 && (
            <dl className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-superficie shadow-sm">
              {rows.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-4 px-5 py-4">
                  <dt className="text-sm text-acero">{f.label}</dt>
                  <dd className="text-right text-base font-semibold text-tinta">{info[f.key]}</dd>
                </div>
              ))}
            </dl>
          )}
          {notas && (
            <div className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
              <p className="text-sm font-semibold text-tinta">{notas.label}</p>
              <p className="mt-1 whitespace-pre-wrap text-base text-acero">{info[notas.key]}</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function hora(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
}

// Aviso de daño preexistente. Se muestra solo al tomar/entregar (no en el menú),
// y la foto va colapsada tras un botón para no tapar el formulario.
function DanoBanner({ dano, fotoUrl }: { dano: DanoActivo; fotoUrl: string | null }) {
  const [verFoto, setVerFoto] = useState(false)
  return (
    <div className="rounded-2xl border border-[#F5C6C6] bg-[#FCE7E7] p-5 shadow-sm">
      <p className="flex items-center gap-2 text-base font-semibold text-[#C81E1E]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5 shrink-0" aria-hidden="true">
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" />
        </svg>
        Este vehículo tiene un daño reportado
      </p>
      {dano.nota && <p className="mt-1 text-sm text-tinta">{dano.nota}</p>}
      {fotoUrl && (
        <>
          <button
            type="button"
            onClick={() => setVerFoto((v) => !v)}
            aria-expanded={verFoto}
            className="mt-3 flex items-center gap-1.5 text-sm font-medium text-[#C81E1E] hover:underline"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`size-4 transition-transform ${verFoto ? 'rotate-90' : ''}`} aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
            {verFoto ? 'Ocultar foto' : 'Ver foto del daño'}
          </button>
          {verFoto && (
            <a href={fotoUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotoUrl} alt="Daño reportado" loading="lazy" className="max-h-56 w-full rounded-xl border border-[#F5C6C6] bg-lienzo object-contain" />
            </a>
          )}
        </>
      )}
      <p className="mt-2 text-xs text-acero">Ya está registrado. Si tomas el vehículo, no se te atribuirá este daño.</p>
    </div>
  )
}

function MenuBoton({ titulo, subtitulo, onClick }: { titulo: string; subtitulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-linea bg-superficie p-5 text-left shadow-sm transition-colors hover:border-azul/40"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-lg font-semibold text-tinta">{titulo}</span>
          <span className="mt-0.5 block text-sm text-acero">{subtitulo}</span>
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5 shrink-0 text-acero" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </span>
    </button>
  )
}

export default function PublicVehicleView({
  vehicle, documents, token, drivers, enUso, danoFotoUrl,
}: {
  vehicle: Vehicle
  documents: Item[]
  token: string
  drivers: { id: string; nombre: string }[]
  enUso: { driverNombre: string; tomadoEn: string } | null
  danoFotoUrl: string | null
}) {
  const [vista, setVista] = useState<'menu' | 'uso' | 'docs' | 'info'>('menu')

  return (
    <main className="mx-auto min-h-dvh max-w-xl space-y-6 px-4 py-10">
      <div className="flex justify-center">
        <TapCarLockup iconClassName="size-6" wordClassName="text-lg" />
      </div>

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

      {vista === 'menu' ? (
        <div className="space-y-3">
          {drivers.length > 0 && (
            <MenuBoton
              titulo={enUso ? 'Entregar vehículo' : 'Tomar vehículo'}
              subtitulo={enUso ? `En uso por ${enUso.driverNombre} · desde ${hora(enUso.tomadoEn)}` : 'Disponible · registra quién lo usa'}
              onClick={() => setVista('uso')}
            />
          )}
          <MenuBoton
            titulo="Documentos del vehículo"
            subtitulo="Permiso de circulación, revisión técnica, SOAP y más"
            onClick={() => setVista('docs')}
          />
          <MenuBoton
            titulo="Información del vehículo"
            subtitulo="Datos útiles para quien lo conduce"
            onClick={() => setVista('info')}
          />
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setVista('menu')}
            className="flex items-center gap-1 text-sm font-medium text-azul hover:underline"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Volver
          </button>
          {vista === 'uso' && vehicle.danoActivo && <DanoBanner dano={vehicle.danoActivo} fotoUrl={danoFotoUrl} />}
          {vista === 'uso' && <UsoPanel token={token} drivers={drivers} enUso={enUso} autoAbrir />}
          {vista === 'docs' && <DocumentosView documents={documents} />}
          {vista === 'info' && <SobreVehiculoView vehicle={vehicle} />}
        </>
      )}

      <p className="pt-2 text-center text-xs text-acero">
        {vista === 'uso'
          ? 'Registro de uso · se confirma con tu PIN'
          : vista === 'docs'
            ? 'Ficha de fiscalización · solo lectura'
            : vista === 'info'
              ? 'Información de referencia · solo lectura'
              : 'Ficha pública del vehículo'}
      </p>
    </main>
  )
}
