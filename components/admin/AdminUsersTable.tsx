'use client'
import { useState } from 'react'
import type { AdminUserRow } from '@/lib/data/admin'

function Row({ u }: { u: AdminUserRow }) {
  const [value, setValue] = useState(String(u.maxVehiculos))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const n = Number(value)
  const invalid = !Number.isInteger(n) || n < 1
  const dirty = n !== u.maxVehiculos

  async function save() {
    if (invalid || !dirty) return
    setSaving(true)
    setError(null)
    setSaved(false)
    const res = await fetch(`/api/admin/users/${u.uid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxVehiculos: n }),
    })
    setSaving(false)
    if (!res.ok) {
      setError('No se pudo guardar.')
      return
    }
    u.maxVehiculos = n
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <li className="rounded-2xl border border-linea bg-superficie p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-tinta">{u.email || '(sin correo)'}</p>
          <p className="truncate text-sm text-acero">
            {u.razonSocial || u.displayName || 'Sin empresa'} · {u.vehicleCount}{' '}
            {u.vehicleCount === 1 ? 'vehículo' : 'vehículos'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor={`max-${u.uid}`} className="text-sm text-acero">
            Cupo
          </label>
          <input
            id={`max-${u.uid}`}
            type="number"
            min={1}
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-20 rounded-lg border border-linea bg-superficie px-2.5 py-1.5 text-center text-tinta tabular-nums focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
          />
          <button
            onClick={save}
            disabled={saving || invalid || !dirty}
            className="rounded-lg bg-azul px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-azul"
          >
            {saving ? '…' : 'Guardar'}
          </button>
        </div>
      </div>

      <div className="mt-1 h-4 text-right text-xs">
        {invalid && <span className="text-vencido">Mínimo 1.</span>}
        {!invalid && error && <span className="text-vencido">{error}</span>}
        {!invalid && !error && saved && <span className="text-[#15803D]">Guardado ✓</span>}
        {!invalid && !error && !saved && u.vehicleCount > u.maxVehiculos && (
          <span className="text-acero">Usa {u.vehicleCount}, sobre el cupo (no podrá agregar más).</span>
        )}
      </div>
    </li>
  )
}

export default function AdminUsersTable({ users }: { users: AdminUserRow[] }) {
  if (users.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-linea bg-superficie/60 px-6 py-12 text-center">
        <p className="text-sm text-acero">No hay usuarios todavía.</p>
      </div>
    )
  }
  return (
    <ul className="space-y-3">
      {users.map((u) => (
        <Row key={u.uid} u={u} />
      ))}
    </ul>
  )
}
