'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CompanyData } from '@/lib/types'

const FIELDS: { key: keyof CompanyData; label: string; placeholder: string }[] = [
  { key: 'razonSocial', label: 'Razón social', placeholder: 'Transportes Ejemplo SpA' },
  { key: 'rut', label: 'RUT', placeholder: '76.123.456-7' },
  { key: 'giro', label: 'Giro', placeholder: 'Transporte de carga' },
  { key: 'direccion', label: 'Dirección', placeholder: 'Av. Siempre Viva 123, Santiago' },
  { key: 'telefono', label: 'Teléfono', placeholder: '+56 9 1234 5678' },
]

export default function CompanyCard({ initial }: { initial: CompanyData }) {
  const router = useRouter()
  const [company, setCompany] = useState<CompanyData>(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company }),
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
    <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Datos de la empresa</h2>
      <p className="mt-1 text-sm text-acero">Aparecerán en los registros de tu flota.</p>

      <form onSubmit={save} className="mt-4 space-y-3">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <label htmlFor={f.key} className="block text-sm font-medium text-acero">
              {f.label}
            </label>
            <input
              id={f.key}
              value={company[f.key]}
              onChange={(e) => setCompany({ ...company, [f.key]: e.target.value })}
              placeholder={f.placeholder}
              className="w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
            />
          </div>
        ))}
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
