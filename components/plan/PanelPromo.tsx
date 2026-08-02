'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import CampoPromo, { type PromoValidada } from '@/components/plan/CampoPromo'

/**
 * Panel de canje en Facturación: acá el plan ya existe (a diferencia del
 * alta, donde el canje va después de guardar el plan), así que no hay orden
 * que respetar y `CampoPromo` canjea directo al validarse.
 */
export default function PanelPromo() {
  const router = useRouter()
  const [canjeando, setCanjeando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function canjear(p: PromoValidada | null) {
    if (!p) return
    setCanjeando(true)
    setError(null)
    try {
      const res = await fetch('/api/promo/canjear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: p.codigo }),
      })
      if (!res.ok) {
        setError('No se pudo canjear el código. Inténtalo de nuevo.')
        return
      }
      router.refresh()
    } catch {
      // Si el fetch RECHAZA (sin conexión, timeout, DNS) el catch es lo único
      // que apaga el estado de carga.
      setError('No se pudo canjear el código. Inténtalo de nuevo.')
    } finally {
      setCanjeando(false)
    }
  }

  return (
    <div className="space-y-2">
      <CampoPromo onValidada={canjear} />
      {canjeando && <p className="text-sm text-acero">Canjeando…</p>}
      {error && <p className="text-sm text-vencido">{error}</p>}
    </div>
  )
}
