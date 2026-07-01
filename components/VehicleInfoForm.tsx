'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { VEHICLE_INFO_FIELDS, type VehicleInfo } from '@/lib/types'

// Edición (dueño) de la info operativa del vehículo. Se guarda en el doc del
// vehículo y aparece en la ficha pública, pestaña "Sobre el vehículo".
export default function VehicleInfoForm({ vehicleId, initial }: { vehicleId: string; initial: VehicleInfo }) {
  const router = useRouter()
  const [info, setInfo] = useState<VehicleInfo>(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    // Guardar solo los campos con contenido (el objeto reemplaza al anterior).
    const clean: VehicleInfo = {}
    for (const { key } of VEHICLE_INFO_FIELDS) {
      const v = (info[key] ?? '').trim()
      if (v) clean[key] = v
    }
    const res = await fetch(`/api/vehicles/${vehicleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ info: clean }),
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
      <h2 className="text-lg font-semibold text-tinta">Sobre el vehículo</h2>
      <p className="mt-1 text-sm text-acero">
        Datos útiles para quien maneje el vehículo. Aparecen en la ficha pública del chip NFC.
      </p>

      <form onSubmit={save} className="mt-4 space-y-3">
        {VEHICLE_INFO_FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <label htmlFor={`vi-${f.key}`} className="block text-sm font-medium text-acero">
              {f.label}
            </label>
            {f.multiline ? (
              <textarea
                id={`vi-${f.key}`}
                rows={3}
                value={info[f.key] ?? ''}
                onChange={(e) => setInfo({ ...info, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                className={inputCls}
              />
            ) : (
              <input
                id={`vi-${f.key}`}
                value={info[f.key] ?? ''}
                onChange={(e) => setInfo({ ...info, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                className={inputCls}
              />
            )}
          </div>
        ))}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          {saved && <span className="text-sm text-[#15803D]">Guardado ✓</span>}
          {error && <span className="text-sm text-vencido">{error}</span>}
        </div>
      </form>
    </section>
  )
}
