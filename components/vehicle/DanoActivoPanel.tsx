'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DanoActivo } from '@/lib/types'

function fecha(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
}

export default function DanoActivoPanel({
  vehicleId, danoActivo, danoFotoUrl, puedeGestionar,
}: {
  vehicleId: string
  danoActivo: DanoActivo | null
  danoFotoUrl: string | null
  puedeGestionar: boolean
}) {
  const router = useRouter()
  const [openMarcar, setOpenMarcar] = useState(false)
  const [nota, setNota] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputCls = 'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'
  const sinDatos = !nota.trim() && !file

  async function marcar(e: React.FormEvent) {
    e.preventDefault()
    if (sinDatos) {
      setError('Agrega un comentario o una foto del daño.')
      return
    }
    setBusy(true); setError(null)
    try {
      let fotoPath: string | null = null
      if (file) {
        const res = await fetch(`/api/vehicles/${vehicleId}/dano/upload-url`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType: file.type }),
        })
        if (!res.ok) throw new Error('upload-url')
        const { uploadUrl, filePath } = await res.json()
        const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
        if (!put.ok) throw new Error('upload')
        fotoPath = filePath
      }
      const res = await fetch(`/api/vehicles/${vehicleId}/dano`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota: nota.trim() || null, fotoPath }),
      })
      if (!res.ok) throw new Error('marcar')
      setOpenMarcar(false); setNota(''); setFile(null); router.refresh()
    } catch {
      setError('No se pudo marcar el daño.')
    } finally {
      setBusy(false)
    }
  }

  async function desmarcar() {
    if (!confirm('¿Marcar este vehículo como sin daño?')) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/vehicles/${vehicleId}/dano`, { method: 'DELETE' })
    setBusy(false)
    if (res.ok) router.refresh()
    else setError('No se pudo actualizar el daño.')
  }

  return (
    <section className="space-y-3 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-tinta">Estado de daño</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${danoActivo ? 'bg-[#FCE7E7] text-[#C81E1E]' : 'bg-[#E6F4EA] text-[#15803D]'}`}>
          {danoActivo ? 'Dañado' : 'Sin daño'}
        </span>
      </div>

      {danoActivo ? (
        <div className="space-y-2">
          <p className="text-sm text-acero">
            Reportado {danoActivo.reportadoPor === 'conductor' ? `por ${danoActivo.reportadoPorNombre ?? 'un conductor'}` : 'por un administrador'} · {fecha(danoActivo.reportadoEn)}
          </p>
          {danoActivo.nota && <p className="text-sm text-tinta">{danoActivo.nota}</p>}
          {danoFotoUrl && (
            <a href={danoFotoUrl} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={danoFotoUrl} alt="Daño reportado" loading="lazy" className="max-h-64 w-full rounded-xl border border-linea bg-lienzo object-contain" />
            </a>
          )}
          {puedeGestionar && (
            <>
              {error && <p className="text-sm text-vencido">{error}</p>}
              <button onClick={desmarcar} disabled={busy} className="rounded-lg border border-linea bg-superficie px-4 py-2 text-sm font-medium text-tinta transition-colors hover:bg-lienzo disabled:opacity-50">
                Marcar como reparado
              </button>
            </>
          )}
        </div>
      ) : (
        <p className="text-sm text-acero">Este vehículo no tiene un daño reportado.</p>
      )}

      {puedeGestionar && !danoActivo && (
        <>
          {!openMarcar ? (
            <button onClick={() => setOpenMarcar(true)} className="rounded-lg bg-azul px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-azul-press">
              Marcar como dañado
            </button>
          ) : (
            <form onSubmit={marcar} className="space-y-3 rounded-xl border border-linea p-4">
              <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Describe el daño (opcional si adjuntas foto)" className={inputCls} />
              <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-acero file:mr-3 file:rounded-lg file:border-0 file:bg-azul/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-azul hover:file:bg-azul/15" />
              {error && <p className="text-sm text-vencido">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={busy || sinDatos} className="rounded-lg bg-azul px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar'}</button>
                <button type="button" onClick={() => setOpenMarcar(false)} className="rounded-lg border border-linea px-4 py-2 text-sm text-tinta">Cancelar</button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  )
}
