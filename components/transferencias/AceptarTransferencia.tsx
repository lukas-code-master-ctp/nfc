'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AceptarTransferencia({ token }: { token: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function aceptar() {
    setCargando(true)
    setError(null)
    const res = await fetch(`/api/transferencias/${token}/aceptar`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setCargando(false)
      setError(data?.mensaje ?? 'No pudimos completar la transferencia.')
      return
    }
    router.push(`/vehiculos/${data.vehicleId}`)
  }

  return (
    <>
      <button
        type="button"
        onClick={aceptar}
        disabled={cargando}
        className="w-full rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50"
      >
        {cargando ? 'Recibiendo…' : 'Aceptar el vehículo'}
      </button>
      {error && <p className="mt-3 text-sm text-vencido">{error}</p>}
    </>
  )
}
