'use client'
import { useState } from 'react'

export default function NfcTokenPanel({ vehicleId, initialUrl }: { vehicleId: string; initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl)

  async function regenerate() {
    if (!confirm('Regenerar el enlace invalida el chip actual. ¿Continuar?')) return
    const res = await fetch(`/api/vehicles/${vehicleId}/token`, { method: 'POST' })
    if (res.ok) {
      const { publicToken } = await res.json()
      const base = url.replace(/\/v\/.*$/, '')
      setUrl(`${base}/v/${publicToken}`)
    }
  }

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-2 font-semibold">Enlace NFC</h3>
      <p className="break-all text-sm text-gray-600">{url}</p>
      <p className="mt-1 text-xs text-gray-500">Graba esta URL en el chip NFC del vehículo.</p>
      <div className="mt-2 flex gap-2">
        <button onClick={() => navigator.clipboard.writeText(url)} className="rounded border px-3 py-1 text-sm">Copiar</button>
        <button onClick={regenerate} className="rounded border px-3 py-1 text-sm text-red-600">Regenerar</button>
      </div>
    </div>
  )
}
