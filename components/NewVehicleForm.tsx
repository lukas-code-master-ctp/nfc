'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewVehicleForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ patente: '', marca: '', modelo: '', anio: '', color: '' })
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const res = await fetch('/api/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) { setError('No se pudo crear el vehículo.'); return }
    setOpen(false)
    setForm({ patente: '', marca: '', modelo: '', anio: '', color: '' })
    router.refresh()
  }

  const LABELS: Record<keyof typeof form, string> = {
    patente: 'Patente',
    marca: 'Marca',
    modelo: 'Modelo',
    anio: 'Año',
    color: 'Color',
  }
  const inputCls =
    'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Nuevo vehículo
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      {(['patente', 'marca', 'modelo', 'anio', 'color'] as const).map((f) => (
        <div key={f} className="space-y-1.5">
          <label className="block text-sm font-medium text-acero">
            {LABELS[f]}{f === 'color' && <span className="font-normal text-acero/70"> (opcional)</span>}
          </label>
          <input className={inputCls} placeholder={LABELS[f]}
            value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })}
            required={f !== 'color'} />
        </div>
      ))}
      {error && <p role="alert" className="rounded-lg bg-[#FCE7E7] px-3 py-2 text-sm text-[#C81E1E]">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit"
          className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press">
          Guardar
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="rounded-lg border border-linea bg-superficie px-4 py-2.5 text-sm font-medium text-tinta transition-colors hover:bg-lienzo">
          Cancelar
        </button>
      </div>
    </form>
  )
}
