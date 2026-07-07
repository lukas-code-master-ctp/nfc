'use client'
import { useCallback, useEffect, useState } from 'react'
import PillTip from '@/components/PillTip'

interface Opcion { id: string; nombre: string }
interface Vehiculo { id: string; patente: string }
interface Uso {
  id: string
  vehicleId: string
  driverNombre: string
  tomadoEn: string
  entregadoEn: string | null
  cierreForzado?: boolean
  km?: number
  bencina?: string
  limpieza?: string
  dano?: { hay: boolean; nota?: string }
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })
}

export default function BitacoraFlota({
  conductores, vehiculos,
}: {
  conductores: Opcion[]
  vehiculos: Vehiculo[]
}) {
  const patentePorId = new Map(vehiculos.map((v) => [v.id, v.patente]))
  const [driverId, setDriverId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [items, setItems] = useState<Uso[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async (reset: boolean) => {
    setLoading(true); setError(null)
    const p = new URLSearchParams()
    if (driverId) p.set('driverId', driverId)
    if (vehicleId) p.set('vehicleId', vehicleId)
    if (desde) p.set('desde', desde)
    if (hasta) p.set('hasta', hasta)
    if (!reset && cursor) p.set('cursor', cursor)
    const res = await fetch(`/api/reportes/usos?${p.toString()}`)
    setLoading(false)
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'No se pudo cargar.')
      return
    }
    const data = await res.json()
    setItems((prev) => (reset ? data.items : [...prev, ...data.items]))
    setCursor(data.nextCursor)
  }, [driverId, vehicleId, desde, hasta, cursor])

  // Recarga desde cero cuando cambian los filtros. Omitimos `cargar` de las deps a
  // propósito: incluye `cursor` (cambia al paginar) y volver a agregarlo dispararía
  // recargas en bucle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(true) }, [driverId, vehicleId, desde, hasta])

  const sel = 'rounded-lg border border-linea bg-superficie px-2 py-1.5 text-sm text-tinta focus:border-azul focus:outline-none'

  return (
    <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Bitácora de la flota</h2>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-acero">Conductor
          <select value={driverId} onChange={(e) => { setDriverId(e.target.value); setVehicleId('') }} className={sel}>
            <option value="">Todos</option>
            {conductores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-acero">Vehículo
          <select value={vehicleId} onChange={(e) => { setVehicleId(e.target.value); setDriverId('') }} className={sel}>
            <option value="">Todos</option>
            {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.patente}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-acero">Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={sel} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-acero">Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={sel} />
        </label>
      </div>

      {error && <p className="mt-4 text-sm text-vencido">{error}</p>}

      {!error && (
        <ul className="mt-4 space-y-2">
          {items.length === 0 && !loading && <li className="text-sm text-acero">Sin usos para el filtro.</li>}
          {items.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 rounded-lg border border-linea px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-tinta">{patentePorId.get(u.vehicleId) ?? u.vehicleId} · {u.driverNombre}</p>
                <p className="text-xs text-acero">
                  Tomó {fecha(u.tomadoEn)}{u.entregadoEn ? ` · Entregó ${fecha(u.entregadoEn)}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                {(u.km != null || u.bencina) && (
                  <PillTip label="Tablero" tono="azul">
                    {u.km != null && <p>Kilometraje: {u.km.toLocaleString('es-CL')} km</p>}
                    {u.bencina && <p>Bencina: {u.bencina}</p>}
                  </PillTip>
                )}
                {u.limpieza && (
                  <PillTip label="Limpieza" tono="azul">
                    <p>Limpieza: {u.limpieza}</p>
                  </PillTip>
                )}
                {u.dano?.hay && (
                  <PillTip label="Daño" tono="rojo">
                    <p>{u.dano.nota || 'Sin nota'}</p>
                  </PillTip>
                )}
                {u.cierreForzado && (
                  <span className="rounded-full bg-[#FDF1DC] px-2 py-0.5 text-xs font-medium text-[#B45309]">Sin entrega</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!error && cursor && (
        <button onClick={() => cargar(false)} disabled={loading} className="mt-3 rounded-lg border border-linea px-4 py-2 text-sm font-medium text-tinta transition-colors hover:bg-lienzo disabled:opacity-50">
          {loading ? 'Cargando…' : 'Cargar más'}
        </button>
      )}
    </section>
  )
}
