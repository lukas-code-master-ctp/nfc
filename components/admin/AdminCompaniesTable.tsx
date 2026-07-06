'use client'
import { useState } from 'react'
import type { AdminCompanyRow } from '@/lib/data/admin'

function Row({ c, onDeleted }: { c: AdminCompanyRow; onDeleted: (id: string) => void }) {
  const [value, setValue] = useState(String(c.maxVehiculos))
  // Cupo ya guardado (parte del valor del servidor y se actualiza al guardar).
  // Estado local en vez de mutar el prop `c`.
  const [savedMax, setSavedMax] = useState(c.maxVehiculos)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [textoConfirm, setTextoConfirm] = useState('')
  const [borrando, setBorrando] = useState(false)
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null)

  const n = Number(value)
  const invalid = !Number.isInteger(n) || n < 1
  const dirty = n !== savedMax

  async function save() {
    if (invalid || !dirty) return
    setSaving(true)
    setError(null)
    setSaved(false)
    const res = await fetch(`/api/admin/companies/${c.companyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxVehiculos: n }),
    })
    setSaving(false)
    if (!res.ok) {
      setError('No se pudo guardar.')
      return
    }
    setSavedMax(n)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function eliminar() {
    setBorrando(true)
    setErrorBorrar(null)
    const res = await fetch(`/api/admin/companies/${c.companyId}`, { method: 'DELETE' })
    setBorrando(false)
    if (res.ok) onDeleted(c.companyId)
    else setErrorBorrar('No se pudo eliminar la empresa.')
  }

  return (
    <li className="rounded-2xl border border-linea bg-superficie p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-tinta">{c.razonSocial || c.ownerEmail || '(sin nombre)'}</p>
          <p className="truncate text-sm text-acero">
            {c.ownerEmail || 'Sin correo'} · {c.vehicleCount}{' '}
            {c.vehicleCount === 1 ? 'vehículo' : 'vehículos'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor={`max-${c.companyId}`} className="text-sm text-acero">
            Cupo
          </label>
          <input
            id={`max-${c.companyId}`}
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
          <button
            onClick={() => { setConfirmando(!confirmando); setTextoConfirm(''); setErrorBorrar(null) }}
            className="text-sm font-medium text-vencido hover:underline"
          >
            Eliminar
          </button>
        </div>
      </div>

      <div className="mt-1 h-4 text-right text-xs">
        {invalid && <span className="text-vencido">Mínimo 1.</span>}
        {!invalid && error && <span className="text-vencido">{error}</span>}
        {!invalid && !error && saved && <span className="text-[#15803D]">Guardado ✓</span>}
        {!invalid && !error && !saved && c.vehicleCount > savedMax && (
          <span className="text-acero">Usa {c.vehicleCount}, sobre el cupo (no podrá agregar más).</span>
        )}
      </div>

      {confirmando && (
        <div className="mt-3 rounded-xl border border-vencido/30 bg-[#FCE7E7]/40 p-3">
          <p className="text-sm text-tinta">
            Se eliminará <span className="font-semibold">{c.razonSocial || c.ownerEmail || 'esta empresa'}</span> con{' '}
            <span className="font-semibold">{c.vehicleCount} {c.vehicleCount === 1 ? 'vehículo' : 'vehículos'}</span>, sus documentos,
            conductores, historial de usos y las cuentas de sus miembros. <span className="font-semibold">No se puede deshacer.</span>
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={textoConfirm}
              onChange={(e) => setTextoConfirm(e.target.value)}
              placeholder="Escribe ELIMINAR para confirmar"
              className="w-full rounded-lg border border-linea bg-superficie px-3 py-2 text-sm text-tinta placeholder:text-acero/45 focus:border-vencido focus:outline-none sm:max-w-xs"
            />
            <div className="flex gap-2">
              <button
                onClick={eliminar}
                disabled={textoConfirm !== 'ELIMINAR' || borrando}
                className="rounded-lg bg-vencido px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C] disabled:opacity-50"
              >
                {borrando ? 'Eliminando…' : 'Eliminar definitivamente'}
              </button>
              <button
                onClick={() => { setConfirmando(false); setTextoConfirm('') }}
                className="rounded-lg border border-linea bg-superficie px-3 py-2 text-sm font-medium text-tinta transition-colors hover:bg-lienzo"
              >
                Cancelar
              </button>
            </div>
          </div>
          {errorBorrar && <p className="mt-2 text-sm text-vencido">{errorBorrar}</p>}
        </div>
      )}
    </li>
  )
}

export default function AdminCompaniesTable({ companies }: { companies: AdminCompanyRow[] }) {
  const [rows, setRows] = useState(companies)

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-linea bg-superficie/60 px-6 py-12 text-center">
        <p className="text-sm text-acero">No hay empresas todavía.</p>
      </div>
    )
  }
  return (
    <ul className="space-y-3">
      {rows.map((c) => (
        <Row key={c.companyId} c={c} onDeleted={(id) => setRows((prev) => prev.filter((r) => r.companyId !== id))} />
      ))}
    </ul>
  )
}
