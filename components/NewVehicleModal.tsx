'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const EMPTY = { patente: '', marca: '', modelo: '', anio: '', color: '' }

// Modal de alta de vehículo. Controlado por el padre (open/onClose) para que
// el botón "Nuevo vehículo" y los slots fantasma del dashboard compartan un
// solo formulario.
export default function NewVehicleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const res = await fetch('/api/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.status === 409) {
      setError('Alcanzaste el límite de tu plan. Amplía tu plan para agregar más vehículos.')
      return
    }
    if (!res.ok) {
      setError('No se pudo crear el vehículo.')
      return
    }
    setForm(EMPTY)
    onClose()
    router.refresh()
  }

  const LABELS: Record<keyof typeof EMPTY, string> = {
    patente: 'Patente',
    marca: 'Marca',
    modelo: 'Modelo',
    anio: 'Año',
    color: 'Color',
  }
  const inputCls =
    'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-tinta/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo vehículo"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-linea bg-superficie p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-tinta">Nuevo vehículo</h2>
        <form onSubmit={submit} className="mt-4 space-y-3">
          {(['patente', 'marca', 'modelo', 'anio', 'color'] as const).map((f) => (
            <div key={f} className="space-y-1.5">
              <label className="block text-sm font-medium text-acero">
                {LABELS[f]}
                {f === 'color' && <span className="font-normal text-acero/70"> (opcional)</span>}
              </label>
              <input
                className={inputCls}
                placeholder={LABELS[f]}
                value={form[f]}
                onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                required={f !== 'color'}
              />
            </div>
          ))}
          {error && (
            <p role="alert" className="rounded-lg bg-[#FCE7E7] px-3 py-2 text-sm text-[#C81E1E]">
              {error}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-linea bg-superficie px-4 py-2.5 text-sm font-medium text-tinta transition-colors hover:bg-lienzo"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
