'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const NIVELES = ['Lleno', '3/4', '1/2', '1/4', 'Reserva']
const LIMPIEZAS = ['limpio', 'aceptable', 'sucio']

export default function UsageDatosEditor({
  usageId, bencina, km, limpieza,
}: {
  usageId: string
  bencina: string | null
  km: number | null
  limpieza: string | null
}) {
  const router = useRouter()
  const [b, setB] = useState(bencina ?? '')
  const [k, setK] = useState(km != null ? String(km) : '')
  const [l, setL] = useState(limpieza ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    setBusy(true); setError(null)
    const payload: Record<string, unknown> = {}
    if (b) payload.bencina = b
    if (k) payload.km = Number(k)
    if (l) payload.limpieza = l
    const res = await fetch(`/api/usages/${usageId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setBusy(false)
    if (res.ok) router.refresh()
    else setError((await res.json().catch(() => ({}))).error ?? 'No se pudo guardar.')
  }

  const sel = 'rounded-lg border border-linea bg-superficie px-2 py-1.5 text-sm text-tinta focus:border-azul focus:outline-none'
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-acero">Bencina
        <select value={b} onChange={(e) => setB(e.target.value)} className={sel}>
          <option value="">—</option>
          {NIVELES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-acero">Kilometraje
        <input value={k} onChange={(e) => setK(e.target.value)} inputMode="numeric" placeholder="km" className={`${sel} w-24`} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-acero">Limpieza
        <select value={l} onChange={(e) => setL(e.target.value)} className={sel}>
          <option value="">—</option>
          {LIMPIEZAS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </label>
      <button onClick={guardar} disabled={busy} className="rounded-lg bg-azul px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50">
        {busy ? 'Guardando…' : 'Guardar'}
      </button>
      {error && <span className="text-xs text-vencido">{error}</span>}
    </div>
  )
}
