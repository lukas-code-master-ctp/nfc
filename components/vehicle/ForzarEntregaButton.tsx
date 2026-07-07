'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Cierra a mano un uso abierto que quedó colgado (el conductor no entregó y
// nadie retomó el vehículo). Solo se muestra a Editor/Administrador.
export default function ForzarEntregaButton({ usageId }: { usageId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function forzar() {
    if (!confirm('¿Forzar la entrega de este uso? El vehículo quedará disponible.')) return
    setBusy(true); setError(false)
    const res = await fetch(`/api/usages/${usageId}/forzar-entrega`, { method: 'POST' })
    setBusy(false)
    if (res.ok) router.refresh()
    else setError(true)
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={forzar}
        disabled={busy}
        className="rounded-lg border border-[#B45309]/30 bg-[#FDF1DC] px-3 py-1.5 text-xs font-medium text-[#B45309] transition-colors hover:bg-[#FDF1DC]/70 disabled:opacity-50"
      >
        {busy ? 'Forzando…' : 'Forzar entrega'}
      </button>
      {error && <span className="ml-2 text-xs text-vencido">No se pudo forzar la entrega.</span>}
    </div>
  )
}
