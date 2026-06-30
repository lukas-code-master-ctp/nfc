'use client'
import { useState } from 'react'
import InfoTip from '@/components/InfoTip'

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
          <rect x="3.5" y="3" width="9.5" height="18" rx="2.2" />
          <line x1="6.5" y1="18.4" x2="10" y2="18.4" />
          <path d="M16.5 9.5a5 5 0 0 1 0 5" />
          <path d="M19.2 7.3a9 9 0 0 1 0 9.4" />
        </svg>
        <h3 className="font-semibold text-tinta">Enlace NFC</h3>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-lienzo px-3 py-2">
        <span className="min-w-0 flex-1 break-all font-mono text-sm text-tinta">{url}</span>
        <button
          onClick={copy}
          aria-label="Copiar enlace"
          title={copied ? '¡Copiado!' : 'Copiar'}
          className="shrink-0 rounded-md p-1.5 text-acero transition-colors hover:bg-linea hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
        >
          {copied ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-vigente" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
              <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            </svg>
          )}
        </button>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-acero">
        Graba esta URL en el chip NFC del vehículo.
        <InfoTip label="Cómo grabar el chip NFC">
          <p className="text-sm font-semibold text-tinta">Cómo grabar el chip</p>
          <p className="mt-1 text-xs text-acero">
            Recomendamos la app gratuita <strong className="text-tinta">NFC Tools</strong> (Android e iPhone).
          </p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs text-acero">
            <li>Copia esta URL con el botón <strong className="text-tinta">Copiar</strong>.</li>
            <li>En NFC Tools abre <strong className="text-tinta">Escribir → Añadir un registro → URL/URI</strong>.</li>
            <li>Pega la URL (con <code className="font-mono">https://</code>) y confirma.</li>
            <li>Toca <strong className="text-tinta">Escribir</strong> y acerca el chip a la parte de arriba del teléfono.</li>
          </ol>
          <p className="mt-2 text-xs text-acero">
            Usa el tipo <strong className="text-tinta">URL/URI</strong> (no «Texto»), o algunos iPhone no abrirán el enlace.
          </p>
        </InfoTip>
      </p>
      <div className="mt-3">
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
