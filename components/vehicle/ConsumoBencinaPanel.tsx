'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ConsumoBencina } from '@/lib/types'

// Configuración (Administrador) de los datos de consumo del vehículo. Con
// rendimiento + capacidad, la bitácora marca los usos con posible consumo
// anómalo. Para Editor/Visor se muestra en solo lectura.
export default function ConsumoBencinaPanel({
  vehicleId,
  initial,
  puedeEditar,
}: {
  vehicleId: string
  initial: ConsumoBencina | null
  puedeEditar: boolean
}) {
  const router = useRouter()
  const [rendimiento, setRendimiento] = useState(initial?.rendimientoKmL != null ? String(initial.rendimientoKmL) : '')
  const [estanque, setEstanque] = useState(initial?.estanqueLitros != null ? String(initial.estanqueLitros) : '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!puedeEditar) {
    return (
      <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-tinta">Consumo de bencina</h2>
        <p className="mt-1 text-sm text-acero">Se usa para detectar consumo anómalo en la bitácora.</p>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-acero">Rendimiento:</dt>
            <dd className="font-medium text-tinta">{initial?.rendimientoKmL != null ? `${initial.rendimientoKmL} km/L` : '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-acero">Capacidad del estanque:</dt>
            <dd className="font-medium text-tinta">{initial?.estanqueLitros != null ? `${initial.estanqueLitros} L` : '—'}</dd>
          </div>
        </dl>
      </section>
    )
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    const consumo = {
      rendimientoKmL: rendimiento.trim() ? Number(rendimiento) : null,
      estanqueLitros: estanque.trim() ? Number(estanque) : null,
    }
    const res = await fetch(`/api/vehicles/${vehicleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consumo }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 2500)
    } else {
      setError('No se pudo guardar.')
    }
  }

  const inputCls =
    'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'

  return (
    <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Consumo de bencina</h2>
      <p className="mt-1 text-sm text-acero">Con estos datos, la bitácora marca los usos con posible consumo anómalo.</p>
      <form onSubmit={save} className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="cb-rendimiento" className="block text-sm font-medium text-acero">Rendimiento (km por litro)</label>
          <input id="cb-rendimiento" type="number" inputMode="decimal" step="0.1" min="0" value={rendimiento} onChange={(e) => setRendimiento(e.target.value)} placeholder="10" className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="cb-estanque" className="block text-sm font-medium text-acero">Capacidad del estanque (litros)</label>
          <input id="cb-estanque" type="number" inputMode="decimal" step="1" min="0" value={estanque} onChange={(e) => setEstanque(e.target.value)} placeholder="50" className={inputCls} />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={saving} className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          {saved && <span className="text-sm text-[#15803D]">Guardado ✓</span>}
          {error && <span className="text-sm text-vencido">{error}</span>}
        </div>
      </form>
    </section>
  )
}
