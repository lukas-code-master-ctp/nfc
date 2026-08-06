'use client'
import { useState } from 'react'

export interface PromoValidada {
  codigo: string
  mesesGratis: number
  vehiculosIncluidos: number
}

// Exportado: lo reusan `SelectorPlan` y `PanelPromo` para traducir el motivo
// que devuelve `POST /api/promo/canjear` en un 409 — antes de este fix ninguno
// de los dos leía el cuerpo de esa respuesta, así que un código que se agotaba
// justo entre "validar" y "canjear" (la carrera para la que existe la
// transacción del servidor) le mostraba al usuario un mensaje genérico que no
// explicaba nada, y encima podía repetirse sin fin en Facturación.
export const MOTIVOS: Record<string, string> = {
  no_existe: 'Ese código no existe.',
  inactivo: 'Ese código ya no está disponible.',
  expirado: 'Ese código venció.',
  agotado: 'Ese código ya se usó todas las veces disponibles.',
  ya_canjeado: 'Ya canjeaste un código promocional en esta cuenta.',
}

/**
 * Campo de código promocional, compartido por `/plan` y `/facturacion`.
 *
 * Solo VALIDA: quién canjea y cuándo lo decide el padre, porque en el alta el
 * canje tiene que ocurrir después de guardar el plan (la promoción empieza
 * donde termina la prueba, y esa fecha no existe hasta que el plan se guardó).
 */
export default function CampoPromo({
  onValidada,
}: {
  onValidada: (p: PromoValidada | null) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [validando, setValidando] = useState(false)
  const [ok, setOk] = useState<PromoValidada | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function validar() {
    if (!codigo.trim()) return
    setValidando(true)
    setError(null)
    setOk(null)
    onValidada(null)
    try {
      const res = await fetch('/api/promo/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo }),
      })
      if (!res.ok) {
        setError('No se pudo revisar el código. Inténtalo de nuevo.')
        return
      }
      const data = await res.json()
      if (!data.valido) {
        setError(MOTIVOS[data.motivo] ?? 'Ese código no se puede usar.')
        return
      }
      const p: PromoValidada = {
        codigo: codigo.trim(),
        mesesGratis: data.mesesGratis,
        vehiculosIncluidos: data.vehiculosIncluidos,
      }
      setOk(p)
      onValidada(p)
    } catch {
      // Si el fetch RECHAZA (sin conexión, timeout, DNS) el catch es lo único
      // que apaga el estado de carga: sin él el botón queda muerto.
      setError('No se pudo revisar el código. Inténtalo de nuevo.')
    } finally {
      setValidando(false)
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-sm text-azul hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
      >
        ¿Tienes un código promocional?
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <label htmlFor="promo" className="block text-sm font-medium text-acero">
        Código promocional
      </label>
      <div className="flex gap-2">
        <input
          id="promo"
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value)
            // Editar el código después de validarlo invalida ese resultado: sin
            // esto, escribir CODIGOB encima de un CODIGOA ya validado deja "3
            // meses gratis" en pantalla y, al continuar, canjea CODIGOA (el
            // padre todavía tiene ESE objeto) mientras el input muestra otra
            // cosa.
            setOk(null)
            setError(null)
            onValidada(null)
          }}
          autoCapitalize="characters"
          className="min-w-0 flex-1 rounded-xl border border-linea bg-superficie px-3 py-2.5 uppercase text-tinta focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
        />
        <button
          type="button"
          onClick={validar}
          disabled={validando}
          className="shrink-0 rounded-xl border border-linea bg-superficie px-4 py-2.5 font-medium text-tinta hover:bg-lienzo disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
        >
          {validando ? 'Revisando…' : 'Aplicar'}
        </button>
      </div>
      {error && <p className="text-sm text-vencido">{error}</p>}
      {ok && (
        <p className="text-sm text-vigente">
          {ok.mesesGratis > 0 && `${ok.mesesGratis} ${ok.mesesGratis === 1 ? 'mes' : 'meses'} gratis`}
          {ok.mesesGratis > 0 && ok.vehiculosIncluidos > 0 && ' · '}
          {ok.vehiculosIncluidos > 0 &&
            `cubre ${ok.vehiculosIncluidos} ${ok.vehiculosIncluidos === 1 ? 'vehículo' : 'vehículos'}`}
        </p>
      )}
    </div>
  )
}
