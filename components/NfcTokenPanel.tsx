'use client'
import { useState } from 'react'

export default function NfcTokenPanel({ vehicleId, initialUrl }: { vehicleId: string; initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl)
  const [copied, setCopied] = useState(false)

  async function regenerate() {
    if (!confirm('Regenerar el enlace invalida el chip actual. ¿Continuar?')) return
    const res = await fetch(`/api/vehicles/${vehicleId}/token`, { method: 'POST' })
    if (res.ok) {
      const { publicToken } = await res.json()
      const base = url.replace(/\/v\/.*$/, '')
      setUrl(`${base}/v/${publicToken}`)
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-azul" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 4-3 5-3 9" /><path d="M9 17c0-2 3-3 3-7a3 3 0 0 0-6 0" /><path d="M12 21v-1" />
        </svg>
        <h3 className="font-semibold text-tinta">Enlace NFC</h3>
      </div>
      <p className="mt-3 break-all rounded-lg bg-lienzo px-3 py-2 font-mono text-sm text-tinta">{url}</p>
      <p className="mt-2 text-xs text-acero">Graba esta URL en el chip NFC del vehículo.</p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-linea bg-superficie px-3 py-1.5 text-sm font-medium text-tinta transition-colors hover:bg-lienzo"
        >
          {copied ? '¡Copiado!' : 'Copiar'}
        </button>
        <button
          onClick={regenerate}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-vencido transition-colors hover:bg-[#FCE7E7]"
        >
          Regenerar
        </button>
      </div>
    </div>
  )
}
