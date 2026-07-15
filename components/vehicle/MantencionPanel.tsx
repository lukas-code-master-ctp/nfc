'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PautaMantencion } from '@/lib/types'
import type { EstadoMantencion } from '@/lib/mantencion/status'

type Mant = { id: string; fecha: string; km: number | null; nota: string | null; fileUrl: string | null }

const BADGE: Record<EstadoMantencion, { label: string; cls: string }> = {
  al_dia: { label: 'Al día', cls: 'bg-[#E6F4EA] text-[#15803D]' },
  proxima: { label: 'Próxima', cls: 'bg-[#FDF1DC] text-[#B45309]' },
  vencida: { label: 'Vencida', cls: 'bg-[#FCE7E7] text-[#C81E1E]' },
  sin_registro: { label: 'Sin registro', cls: 'bg-[#EEF0F3] text-acero' },
  sin_pauta: { label: 'Sin pauta', cls: 'bg-[#EEF0F3] text-acero' },
}

function fecha(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function MantencionPanel({
  vehicleId, estado, detalle, pautaEfectiva, esOverride, kmActual,
  mantenciones, puedeRegistrar, puedeConfigurar,
}: {
  vehicleId: string
  estado: EstadoMantencion
  detalle: { kmRestantes?: number; diasRestantes?: number; proximaKm?: number; proximaFecha?: string }
  pautaEfectiva: PautaMantencion | null
  esOverride: boolean
  pautaEstandar: PautaMantencion | null
  kmActual: number | null
  mantenciones: Mant[]
  puedeRegistrar: boolean
  puedeConfigurar: boolean
}) {
  const router = useRouter()
  const [openReg, setOpenReg] = useState(false)
  const [openPauta, setOpenPauta] = useState(false)
  const [fechaReg, setFechaReg] = useState('')
  const [kmReg, setKmReg] = useState<string>(kmActual != null ? String(kmActual) : '')
  const [nota, setNota] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cadaKm, setCadaKm] = useState<string>(esOverride && pautaEfectiva?.cadaKm != null ? String(pautaEfectiva.cadaKm) : '')
  const [cadaMeses, setCadaMeses] = useState<string>(esOverride && pautaEfectiva?.cadaMeses != null ? String(pautaEfectiva.cadaMeses) : '')

  const badge = BADGE[estado]
  const inputCls = 'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'

  const detalleTexto = (() => {
    if (estado === 'sin_pauta') return 'Este vehículo no tiene una pauta configurada.'
    if (estado === 'sin_registro') return 'Registra la última mantención para empezar a controlar la pauta.'
    const partes: string[] = []
    if (detalle.kmRestantes != null) partes.push(detalle.kmRestantes <= 0 ? `pasada por ${Math.abs(detalle.kmRestantes).toLocaleString('es-CL')} km` : `faltan ${detalle.kmRestantes.toLocaleString('es-CL')} km`)
    if (detalle.diasRestantes != null) partes.push(detalle.diasRestantes < 0 ? `vencida hace ${Math.abs(detalle.diasRestantes)} días` : `faltan ${detalle.diasRestantes} días`)
    return partes.join(' · ') || '—'
  })()

  async function registrar(e: React.FormEvent) {
    e.preventDefault()
    if (!fechaReg) { setError('Indica la fecha de la mantención.'); return }
    setBusy(true); setError(null)
    try {
      let filePath: string | null = null
      if (file) {
        const res = await fetch('/api/mantenciones/upload-url', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleId, fileName: file.name, contentType: file.type }),
        })
        if (!res.ok) throw new Error('upload-url')
        const { uploadUrl, filePath: fp } = await res.json()
        const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
        if (!put.ok) throw new Error('upload')
        filePath = fp
      }
      const create = await fetch('/api/mantenciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId, fecha: fechaReg, km: kmReg ? Math.floor(Number(kmReg)) : null, nota: nota || null, filePath }),
      })
      if (!create.ok) throw new Error('create')
      setOpenReg(false); setFile(null); setNota(''); router.refresh()
    } catch {
      setError('No se pudo registrar la mantención.')
    } finally {
      setBusy(false)
    }
  }

  async function guardarPauta(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const pauta = (!cadaKm && !cadaMeses)
      ? null
      : { cadaKm: cadaKm ? Math.max(1, Math.floor(Number(cadaKm))) : null, cadaMeses: cadaMeses ? Math.max(1, Math.floor(Number(cadaMeses))) : null }
    const res = await fetch(`/api/vehicles/${vehicleId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pautaMantencion: pauta }),
    })
    setBusy(false)
    if (res.ok) { setOpenPauta(false); router.refresh() }
    else setError('No se pudo guardar la pauta.')
  }

  async function borrar(id: string) {
    if (!confirm('¿Eliminar esta mantención?')) return
    const res = await fetch(`/api/mantenciones/${id}`, { method: 'DELETE' })
    if (res.ok) router.refresh()
  }

  return (
    <section className="space-y-3 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-tinta">Mantención</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
      </div>
      <p className="text-sm text-acero">{detalleTexto}</p>
      <p className="text-sm text-acero">
        Pauta: {pautaEfectiva && (pautaEfectiva.cadaKm || pautaEfectiva.cadaMeses)
          ? [pautaEfectiva.cadaKm ? `cada ${pautaEfectiva.cadaKm.toLocaleString('es-CL')} km` : null, pautaEfectiva.cadaMeses ? `cada ${pautaEfectiva.cadaMeses} meses` : null].filter(Boolean).join(' · ')
          : 'sin definir'}
        {esOverride && <span className="ml-1 rounded bg-[#EEF0F3] px-1.5 py-0.5 text-xs text-acero">propia del vehículo</span>}
      </p>

      <div className="flex flex-wrap gap-2 pt-1">
        {puedeRegistrar && (
          <button onClick={() => setOpenReg((v) => !v)} className="rounded-lg bg-azul px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-azul-press">
            Registrar mantención
          </button>
        )}
        {puedeConfigurar && (
          <button onClick={() => setOpenPauta((v) => !v)} className="rounded-lg border border-linea bg-superficie px-4 py-2 text-sm font-medium text-tinta transition-colors hover:bg-lienzo">
            {esOverride ? 'Editar pauta del vehículo' : 'Pauta propia'}
          </button>
        )}
      </div>

      {openReg && puedeRegistrar && (
        <form onSubmit={registrar} className="space-y-3 rounded-xl border border-linea p-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-acero">Fecha de la mantención</label>
            <input type="date" value={fechaReg} onChange={(e) => setFechaReg(e.target.value)} required className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-acero">Kilometraje <span className="font-normal text-acero/70">(opcional)</span></label>
            <input type="number" min={0} value={kmReg} onChange={(e) => setKmReg(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-acero">Nota <span className="font-normal text-acero/70">(opcional)</span></label>
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-acero">Archivo de constancia <span className="font-normal text-acero/70">(opcional)</span></label>
            <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-acero file:mr-3 file:rounded-lg file:border-0 file:bg-azul/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-azul hover:file:bg-azul/15" />
          </div>
          {error && <p className="text-sm text-vencido">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="rounded-lg bg-azul px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar'}</button>
            <button type="button" onClick={() => setOpenReg(false)} className="rounded-lg border border-linea px-4 py-2 text-sm text-tinta">Cancelar</button>
          </div>
        </form>
      )}

      {openPauta && puedeConfigurar && (
        <form onSubmit={guardarPauta} className="space-y-3 rounded-xl border border-linea p-4">
          <p className="text-xs text-acero">Deja ambos vacíos para que el vehículo use la pauta estándar de la empresa.</p>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-acero">Cada cuántos km</label>
            <input type="number" min={1} value={cadaKm} onChange={(e) => setCadaKm(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-acero">Cada cuántos meses</label>
            <input type="number" min={1} value={cadaMeses} onChange={(e) => setCadaMeses(e.target.value)} className={inputCls} />
          </div>
          {error && <p className="text-sm text-vencido">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="rounded-lg bg-azul px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Guardar</button>
            <button type="button" onClick={() => setOpenPauta(false)} className="rounded-lg border border-linea px-4 py-2 text-sm text-tinta">Cancelar</button>
          </div>
        </form>
      )}

      {mantenciones.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-acero">Historial</p>
          {mantenciones.map((mt) => (
            <div key={mt.id} className="flex items-center justify-between gap-3 rounded-lg border border-linea px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium text-tinta">{fecha(mt.fecha)}</span>
                {mt.km != null && <span className="text-acero"> · {mt.km.toLocaleString('es-CL')} km</span>}
                {mt.nota && <span className="block truncate text-acero">{mt.nota}</span>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {mt.fileUrl && <a href={mt.fileUrl} target="_blank" rel="noopener noreferrer" className="text-azul hover:underline">Constancia</a>}
                {puedeRegistrar && <button onClick={() => borrar(mt.id)} className="text-acero transition-colors hover:text-[#C81E1E]" aria-label="Eliminar mantención">Eliminar</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
