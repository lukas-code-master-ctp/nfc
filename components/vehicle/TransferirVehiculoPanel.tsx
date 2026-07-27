'use client'
import { useState } from 'react'

type Pendiente = { paraEmail: string; expiresAt: string }

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'long' })

export default function TransferirVehiculoPanel({
  vehicleId,
  patente,
  pendiente,
}: {
  vehicleId: string
  patente: string
  pendiente: Pendiente | null
}) {
  const [email, setEmail] = useState('')
  const [actual, setActual] = useState<Pendiente | null>(pendiente)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function transferir(e: React.FormEvent) {
    e.preventDefault()
    const destino = email.trim()
    if (!destino) return
    if (!confirm(`¿Transferir ${patente} a ${destino}? El vehículo se moverá recién cuando esa cuenta acepte.`)) return

    setCargando(true)
    setError(null)
    const res = await fetch(`/api/vehicles/${vehicleId}/transferir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: destino }),
    })
    const data = await res.json().catch(() => ({}))
    setCargando(false)
    if (!res.ok) {
      setError(data?.mensaje ?? 'No pudimos enviar la transferencia.')
      return
    }
    setActual({ paraEmail: destino, expiresAt: data?.transferencia?.expiresAt ?? '' })
    setEmail('')
  }

  async function cancelar() {
    setCargando(true)
    const res = await fetch(`/api/vehicles/${vehicleId}/transferir`, { method: 'DELETE' })
    setCargando(false)
    if (res.ok) setActual(null)
  }

  return (
    <div className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h3 className="font-semibold text-tinta">Transferir vehículo</h3>

      {actual ? (
        <>
          <p className="mt-2 text-sm text-acero">
            Pendiente de aceptación por <strong className="text-tinta">{actual.paraEmail}</strong>
            {actual.expiresAt ? ` · vence el ${fecha(actual.expiresAt)}` : ''}.
          </p>
          <p className="mt-1 text-xs text-acero">El vehículo sigue siendo tuyo hasta que acepten.</p>
          <button
            type="button"
            onClick={cancelar}
            disabled={cargando}
            className="mt-3 rounded-lg px-3 py-1.5 text-sm font-medium text-vencido transition-colors hover:bg-[#FCE7E7] disabled:opacity-50"
          >
            Cancelar transferencia
          </button>
        </>
      ) : (
        <form onSubmit={transferir} className="mt-3 space-y-3">
          <p className="text-sm text-acero">
            Se van con el vehículo sus documentos y su historial de mantenciones. Tu bitácora de usos se queda contigo.
          </p>
          <div>
            <label htmlFor="transferir-email" className="block text-sm font-medium text-tinta">
              Correo de la cuenta que lo recibe
            </label>
            <input
              id="transferir-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@empresa.cl"
              className="mt-1 w-full rounded-lg border border-linea bg-lienzo px-3 py-2 text-sm text-tinta focus:border-azul focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-vencido">{error}</p>}
          <button
            type="submit"
            disabled={cargando || !email.trim()}
            className="rounded-lg bg-azul px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50"
          >
            Transferir
          </button>
        </form>
      )}
    </div>
  )
}
