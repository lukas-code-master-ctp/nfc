'use client'
import { useEffect, useState } from 'react'

interface Driver { id: string; nombre: string; rut: string | null; activo: boolean; pin: string | null }

function OjoIcon({ tachado }: { tachado: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
      {tachado ? (
        <>
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" x2="22" y1="2" y2="22" />
        </>
      ) : (
        <>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  )
}

export default function DriversCard() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [nombre, setNombre] = useState('')
  const [rut, setRut] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Fila con el PIN revelado y fila en edición de PIN (una a la vez).
  const [pinVisibleDe, setPinVisibleDe] = useState<string | null>(null)
  const [editandoPinDe, setEditandoPinDe] = useState<string | null>(null)
  const [nuevoPin, setNuevoPin] = useState('')

  async function load() {
    const res = await fetch('/api/conductores')
    if (res.ok) setDrivers((await res.json()).drivers)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await fetch('/api/conductores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, rut: rut || undefined, pin }),
    })
    setBusy(false)
    if (res.ok) { setNombre(''); setRut(''); setPin(''); load() }
    else setError((await res.json().catch(() => ({}))).error ?? 'No se pudo agregar.')
  }

  async function toggleActivo(d: Driver) {
    await fetch(`/api/conductores/${d.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !d.activo }),
    })
    load()
  }
  async function guardarPin(d: Driver) {
    setError(null)
    const res = await fetch(`/api/conductores/${d.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: nuevoPin }),
    })
    if (res.ok) { setEditandoPinDe(null); setNuevoPin(''); load() }
    else setError((await res.json().catch(() => ({}))).error ?? 'El PIN debe ser de 4 dígitos.')
  }
  async function eliminar(d: Driver) {
    if (!confirm(`¿Eliminar a ${d.nombre} del padrón? Su historial de usos se conserva.`)) return
    await fetch(`/api/conductores/${d.id}`, { method: 'DELETE' })
    load()
  }

  const inputCls = 'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'

  return (
    <section className="mt-5 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Conductores</h2>
      <p className="mt-1 text-sm text-acero">Padrón de quienes usan la flota. Cada uno confirma con su PIN al tomar o entregar un vehículo.</p>

      {loading ? (
        <p className="mt-4 text-sm text-acero">Cargando…</p>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {drivers.map((d) => (
              <li key={d.id} className="rounded-lg border border-linea px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-tinta">{d.nombre} {!d.activo && <span className="text-xs text-acero">(inactivo)</span>}</p>
                    {d.rut && <span className="text-xs text-acero">{d.rut}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="flex items-center gap-1 font-mono text-sm text-tinta">
                      {d.pin ? (pinVisibleDe === d.id ? d.pin : '••••') : <span title="PIN asignado antes de este cambio; actualízalo para verlo" className="text-acero">—</span>}
                      {d.pin && (
                        <button
                          type="button"
                          onClick={() => setPinVisibleDe(pinVisibleDe === d.id ? null : d.id)}
                          aria-label={pinVisibleDe === d.id ? 'Ocultar PIN' : 'Ver PIN'}
                          className="text-acero hover:text-tinta"
                        >
                          <OjoIcon tachado={pinVisibleDe === d.id} />
                        </button>
                      )}
                    </span>
                    <button onClick={() => { setEditandoPinDe(editandoPinDe === d.id ? null : d.id); setNuevoPin(''); setError(null) }} className="text-azul hover:underline">
                      Actualizar PIN
                    </button>
                    <button onClick={() => toggleActivo(d)} className="text-acero hover:underline">{d.activo ? 'Desactivar' : 'Activar'}</button>
                    <button onClick={() => eliminar(d)} className="text-vencido hover:underline">Eliminar</button>
                  </div>
                </div>
                {editandoPinDe === d.id && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={nuevoPin}
                      onChange={(e) => setNuevoPin(e.target.value)}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="Nuevo PIN (4 dígitos)"
                      className="w-44 rounded-lg border border-linea bg-superficie px-3 py-1.5 text-sm text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none"
                    />
                    <button onClick={() => guardarPin(d)} className="rounded-lg bg-azul px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press">Guardar</button>
                    <button onClick={() => { setEditandoPinDe(null); setNuevoPin('') }} className="rounded-lg border border-linea px-3 py-1.5 text-sm font-medium text-tinta transition-colors hover:bg-lienzo">Cancelar</button>
                  </div>
                )}
              </li>
            ))}
            {drivers.length === 0 && <li className="text-sm text-acero">Aún no hay conductores.</li>}
          </ul>

          <form onSubmit={agregar} className="mt-4 space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required placeholder="Nombre" className={inputCls} />
              <input value={rut} onChange={(e) => setRut(e.target.value)} placeholder="RUT (opcional)" className={inputCls} />
              <input value={pin} onChange={(e) => setPin(e.target.value)} required inputMode="numeric" maxLength={4} placeholder="PIN (4 dígitos)" className={inputCls} />
              <button type="submit" disabled={busy} className="shrink-0 rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50">
                {busy ? 'Agregando…' : 'Agregar'}
              </button>
            </div>
            {error && <p className="text-sm text-vencido">{error}</p>}
          </form>
        </>
      )}
    </section>
  )
}
