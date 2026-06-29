'use client'
import { useState } from 'react'
import { PRICE_PER_VEHICLE, monthlyTotal, formatCLP } from '@/lib/billing'

export default function BillingRequestForm({ currentCupo }: { currentCupo: number }) {
  const [value, setValue] = useState(String(currentCupo))
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const n = Number(value)
  const invalid = !Number.isInteger(n) || n < 1

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (invalid) return
    setSaving(true)
    setError(null)
    const res = await fetch('/api/billing/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ desiredVehicles: n, message }),
    })
    setSaving(false)
    if (!res.ok) {
      setError('No se pudo enviar la solicitud. Inténtalo de nuevo.')
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-tinta">Solicitud recibida ✓</h2>
        <p className="mt-1 text-sm text-acero">
          Te contactaremos pronto para coordinar el pago y la factura. Gracias.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Contratar o ampliar tu plan</h2>
      <p className="mt-1 text-sm text-acero">
        Indica a cuántos vehículos quieres llevar tu plan y te contactamos para coordinar el pago y la factura.
      </p>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="desired" className="block text-sm font-medium text-acero">
            Vehículos en tu plan
          </label>
          <div className="flex items-center gap-3">
            <input
              id="desired"
              type="number"
              min={1}
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-24 rounded-lg border border-linea bg-superficie px-3 py-2.5 text-center text-tinta tabular-nums focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
            />
            <span className="text-sm text-acero">
              × {formatCLP(PRICE_PER_VEHICLE)} ={' '}
              <span className="font-semibold text-tinta">
                {invalid ? '—' : `${formatCLP(monthlyTotal(n))} / mes`}
              </span>
            </span>
          </div>
          {invalid && <p className="text-sm text-vencido">Mínimo 1 vehículo.</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="msg" className="block text-sm font-medium text-acero">
            Mensaje <span className="font-normal text-acero/70">(opcional)</span>
          </label>
          <textarea
            id="msg"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="¿Algo que debamos saber? (datos de facturación, plazos, etc.)"
            className="w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
          />
        </div>

        {error && <p className="text-sm text-vencido">{error}</p>}

        <button
          type="submit"
          disabled={saving || invalid}
          className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </form>
    </section>
  )
}
