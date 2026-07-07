'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RevisarDanoButton({ usageId }: { usageId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function revisar() {
    setBusy(true); setError(false)
    const res = await fetch(`/api/usages/${usageId}/revisar-dano`, { method: 'POST' })
    setBusy(false)
    if (res.ok) router.refresh()
    else setError(true)
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={revisar}
        disabled={busy}
        className="rounded-lg border border-[#C81E1E]/30 bg-[#FCE7E7] px-3 py-1.5 text-xs font-medium text-[#C81E1E] transition-colors hover:bg-[#FCE7E7]/70 disabled:opacity-50"
      >
        {busy ? 'Registrando…' : 'Marcar daño como revisado'}
      </button>
      {error && <span className="ml-2 text-xs text-vencido">No se pudo registrar.</span>}
    </div>
  )
}
