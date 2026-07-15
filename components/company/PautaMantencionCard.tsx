'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PautaMantencion } from '@/lib/types'

export default function PautaMantencionCard({ initial }: { initial: PautaMantencion }) {
  const router = useRouter()
  const [cadaKm, setCadaKm] = useState<string>(initial.cadaKm != null ? String(initial.cadaKm) : '')
  const [cadaMeses, setCadaMeses] = useState<string>(initial.cadaMeses != null ? String(initial.cadaMeses) : '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null); setSaved(false)
    const pauta = {
      cadaKm: cadaKm ? Math.max(1, Math.floor(Number(cadaKm))) : null,
      cadaMeses: cadaMeses ? Math.max(1, Math.floor(Number(cadaMeses))) : null,
    }
    const res = await fetch('/api/company', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pautaMantencion: pauta }),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 2500) }
    else setError('No se pudo guardar.')
  }

  const inputCls = 'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'

  return (
    <section className="mt-5 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Pauta de mantención estándar</h2>
      <p className="mt-1 text-sm text-acero">La pauta por defecto para toda la flota. Cada vehículo puede tener una pauta propia en su ficha.</p>
      <form onSubmit={save} className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="cadaKm" className="block text-sm font-medium text-acero">Cada cuántos kilómetros <span className="font-normal text-acero/70">(opcional)</span></label>
          <input id="cadaKm" type="number" min={1} value={cadaKm} onChange={(e) => setCadaKm(e.target.value)} placeholder="Ej. 10000" className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="cadaMeses" className="block text-sm font-medium text-acero">Cada cuántos meses <span className="font-normal text-acero/70">(opcional)</span></label>
          <input id="cadaMeses" type="number" min={1} value={cadaMeses} onChange={(e) => setCadaMeses(e.target.value)} placeholder="Ej. 6" className={inputCls} />
        </div>
        <p className="text-xs text-acero">Si defines ambos, la mantención se marca por lo que ocurra primero. Deja vacío para no usar ese criterio.</p>
        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={saving} className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
          {saved && <span className="text-sm text-[#15803D]">Guardado ✓</span>}
          {error && <span className="text-sm text-vencido">{error}</span>}
        </div>
      </form>
    </section>
  )
}
