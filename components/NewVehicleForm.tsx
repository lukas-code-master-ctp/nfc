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

  if (!open) {
    return <button onClick={() => setOpen(true)} className="rounded bg-blue-600 px-4 py-2 text-white">+ Nuevo vehículo</button>
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border p-4">
      {(['patente', 'marca', 'modelo', 'anio', 'color'] as const).map((f) => (
        <input key={f} className="w-full rounded border p-2" placeholder={f}
          value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })}
          required={f !== 'color'} />
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">Guardar</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded border px-4 py-2">Cancelar</button>
      </div>
    </form>
  )
}
