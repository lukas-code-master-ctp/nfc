'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AtenderAlertaButton({ alertaId }: { alertaId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function atender() {
    setBusy(true)
    const res = await fetch(`/api/alertas/${alertaId}`, { method: 'DELETE' })
    setBusy(false)
    if (res.ok) router.refresh()
  }
  return (
    <button
      onClick={atender}
      disabled={busy}
      className="shrink-0 rounded-lg border border-linea px-3 py-1.5 text-sm font-medium text-tinta transition-colors hover:bg-lienzo disabled:opacity-50"
    >
      {busy ? '…' : 'Atender'}
    </button>
  )
}
