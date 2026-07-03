'use client'
import { useEffect, useState } from 'react'

interface Driver { id: string; nombre: string; rut: string | null; activo: boolean }

export default function DriversCard() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [nombre, setNombre] = useState('')
  const [rut, setRut] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
  async function resetPin(d: Driver) {
    const nuevo = prompt(`Nuevo PIN de 4 dígitos para ${d.nombre}:`)
    if (!nuevo) return
    const res = await fetch(`/api/conductores/${d.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: nuevo }),
    })
    if (!res.ok) alert('PIN inválido (deben ser 4 dígitos).')
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
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-linea px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-tinta">{d.nombre} {!d.activo && <span className="text-xs text-acero">(inactivo)</span>}</p>
                  {d.rut && <span className="text-xs text-acero">{d.rut}</span>}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <button onClick={() => resetPin(d)} className="text-azul hover:underline">PIN</button>
                  <button onClick={() => toggleActivo(d)} className="text-acero hover:underline">{d.activo ? 'Desactivar' : 'Activar'}</button>
                  <button onClick={() => eliminar(d)} className="text-vencido hover:underline">Eliminar</button>
                </div>
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
