'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Driver = { id: string; nombre: string }
type Modo = 'idle' | 'tomar' | 'entregar'

function hora(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
}

async function subirFoto(token: string, driverId: string, pin: string, tipo: string, file: File): Promise<string> {
  const res = await fetch(`/api/v/${token}/upload-url`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driverId, pin, tipo, contentType: file.type }),
  })
  if (!res.ok) throw new Error('upload-url')
  const { uploadUrl, filePath } = await res.json()
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
  if (!put.ok) throw new Error('upload')
  return filePath
}

export default function UsoPanel({ token, drivers, enUso, autoAbrir = false }: { token: string; drivers: Driver[]; enUso: { driverNombre: string; tomadoEn: string } | null; autoAbrir?: boolean }) {
  const router = useRouter()
  // Al entrar desde el menú de la ficha, abre directo el formulario que corresponde
  // (evita el doble tap: el usuario ya eligió "Tomar/Entregar" en el menú).
  const [modo, setModo] = useState<Modo>(autoAbrir ? (enUso ? 'entregar' : 'tomar') : 'idle')
  const [driverId, setDriverId] = useState('')
  const [pin, setPin] = useState('')
  const [tablero, setTablero] = useState<File | null>(null)
  const [cabina, setCabina] = useState<File | null>(null)
  const [hayDano, setHayDano] = useState(false)
  const [notaDano, setNotaDano] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setModo('idle'); setDriverId(''); setPin(''); setTablero(null); setCabina(null)
    setHayDano(false); setNotaDano(''); setError(null)
  }

  function errorDePin(status: number): string {
    if (status === 429) return 'Demasiados intentos. Espera unos minutos.'
    if (status === 401) return 'PIN incorrecto.'
    return 'No se pudo completar la acción.'
  }

  async function tomar(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await fetch(`/api/v/${token}/tomar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId, pin }),
    })
    setBusy(false)
    if (res.ok) { reset(); router.refresh() }
    else setError(errorDePin(res.status))
  }

  async function entregar(e: React.FormEvent) {
    e.preventDefault()
    if (!tablero || !cabina) { setError('Sube la foto del tablero y la de la cabina.'); return }
    setBusy(true); setError(null)
    try {
      const fTablero = await subirFoto(token, driverId, pin, 'tablero', tablero)
      const fCabina = await subirFoto(token, driverId, pin, 'cabina', cabina)
      const res = await fetch(`/api/v/${token}/entregar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId, pin, fotos: { tablero: fTablero, cabina: fCabina }, dano: hayDano ? { hay: true, nota: notaDano } : undefined }),
      })
      setBusy(false)
      if (res.ok) { reset(); router.refresh() }
      else setError(errorDePin(res.status))
    } catch {
      setBusy(false)
      setError('No se pudieron subir las fotos. Revisa tu conexión.')
    }
  }

  const inputCls = 'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-base text-tinta focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'
  const btnPrimary = 'w-full rounded-lg bg-azul px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50'
  const fileCls = 'block w-full text-sm text-acero file:mr-3 file:rounded-lg file:border-0 file:bg-azul/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-azul'

  // Banner de estado
  const banner = (
    <div className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      {enUso ? (
        <>
          <p className="text-base font-semibold text-tinta">En uso por {enUso.driverNombre}</p>
          <p className="text-sm text-acero">Desde el {hora(enUso.tomadoEn)}</p>
          {modo === 'idle' && (
            <button onClick={() => setModo('entregar')} className={`mt-3 ${btnPrimary}`}>Entregar vehículo</button>
          )}
        </>
      ) : (
        <>
          <p className="text-base font-semibold text-tinta">Vehículo disponible</p>
          {modo === 'idle' && (
            <button onClick={() => setModo('tomar')} className={`mt-3 ${btnPrimary}`} disabled={drivers.length === 0}>Tomar vehículo</button>
          )}
          {modo === 'idle' && drivers.length === 0 && (
            <p className="mt-2 text-sm text-acero">No hay conductores registrados. Pídele a un administrador que te agregue.</p>
          )}
        </>
      )}

      {modo === 'tomar' && (
        <form onSubmit={tomar} className="mt-3 space-y-3">
          <select value={driverId} onChange={(e) => setDriverId(e.target.value)} required className={inputCls}>
            <option value="">¿Quién eres?</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
          <input value={pin} onChange={(e) => setPin(e.target.value)} required inputMode="numeric" maxLength={4} placeholder="Tu PIN" className={inputCls} />
          {error && <p className="text-sm text-vencido">{error}</p>}
          <button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Tomando…' : 'Confirmar'}</button>
          <button type="button" onClick={reset} className="w-full text-sm text-acero">Cancelar</button>
        </form>
      )}

      {modo === 'entregar' && (
        <form onSubmit={entregar} className="mt-3 space-y-3">
          <select value={driverId} onChange={(e) => setDriverId(e.target.value)} required className={inputCls}>
            <option value="">¿Quién entrega?</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
          <input value={pin} onChange={(e) => setPin(e.target.value)} required inputMode="numeric" maxLength={4} placeholder="Tu PIN" className={inputCls} />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-acero">Foto del tablero (bencina + kilometraje)</label>
            <input type="file" accept="image/*" capture="environment" required onChange={(e) => setTablero(e.target.files?.[0] ?? null)} className={fileCls} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-acero">Foto general de la cabina</label>
            <input type="file" accept="image/*" capture="environment" required onChange={(e) => setCabina(e.target.files?.[0] ?? null)} className={fileCls} />
          </div>
          <label className="flex items-center gap-2 text-sm text-tinta">
            <input type="checkbox" checked={hayDano} onChange={(e) => setHayDano(e.target.checked)} />
            El vehículo sufrió algún daño
          </label>
          {hayDano && (
            <textarea value={notaDano} onChange={(e) => setNotaDano(e.target.value)} rows={2} placeholder="Describe el daño" className={inputCls} />
          )}
          {error && <p className="text-sm text-vencido">{error}</p>}
          <button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Entregando…' : 'Confirmar entrega'}</button>
          <button type="button" onClick={reset} className="w-full text-sm text-acero">Cancelar</button>
        </form>
      )}
    </div>
  )

  return banner
}
