'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Ajustes operativos de la empresa (cómo se comporta TapCar con su flota).
// Solo lo edita el Administrador. Guarda vía el mismo PATCH /api/company que los
// datos de empresa, pero mandando solo `avisoUsoHoras`.
export default function PlataformaCard({ avisoUsoHoras }: { avisoUsoHoras: number }) {
  const router = useRouter()
  const [horas, setHoras] = useState<number>(avisoUsoHoras)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    const res = await fetch('/api/company', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avisoUsoHoras: Math.max(1, Math.floor(Number(horas) || 12)) }),
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

  return (
    <section className="mt-5 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Configuración de la plataforma</h2>
      <p className="mt-1 text-sm text-acero">Ajusta cómo se comporta TapCar con tu flota.</p>

      <form onSubmit={save} className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="avisoUsoHoras" className="block text-sm font-medium text-acero">
            Avisar uso sin entregar (horas)
          </label>
          <input
            id="avisoUsoHoras"
            type="number"
            min={1}
            value={horas}
            onChange={(e) => setHoras(Number(e.target.value))}
            className="w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
          />
          <p className="text-xs text-acero">
            Un vehículo que lleve más de estas horas &quot;en uso&quot; sin entregar se marcará en Flota.
          </p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
          {saved && <span className="text-sm text-[#15803D]">Guardado ✓</span>}
          {error && <span className="text-sm text-vencido">{error}</span>}
        </div>
      </form>
    </section>
  )
}
