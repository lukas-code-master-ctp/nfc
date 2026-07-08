'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Categoria } from '@/lib/types'

export default function CategoriaSelector({
  vehicleId, categoriaId, categorias,
}: {
  vehicleId: string
  categoriaId: string | null
  categorias: Categoria[]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  async function cambiar(value: string) {
    setSaving(true); setError(false)
    const res = await fetch(`/api/vehicles/${vehicleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoriaId: value || null }),
    })
    setSaving(false)
    if (res.ok) router.refresh()
    else setError(true)
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-acero">Categoría</span>
      <select
        value={categoriaId ?? ''}
        disabled={saving}
        onChange={(e) => cambiar(e.target.value)}
        className="rounded-lg border border-linea bg-superficie px-3 py-1.5 text-sm text-tinta focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20 disabled:opacity-50"
      >
        <option value="">Sin categoría</option>
        {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      {error && <span className="text-xs text-vencido">No se pudo guardar.</span>}
    </label>
  )
}
