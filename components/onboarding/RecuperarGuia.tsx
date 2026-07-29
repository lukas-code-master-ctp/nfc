'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Card de Configuración con las dos salidas de la guía de configuración.
 *
 * Existe porque la tarjeta del dashboard desaparece sola al completarse
 * (`completadoEn`) y el enlace para pasar a cuenta de empresa vive dentro de
 * ella: sin esta card, quien elige cuenta personal y termina sus tres pasos
 * pierde para siempre la forma de pedir los pasos de flota.
 *
 * `PATCH /api/onboarding` con `tipoCuenta` limpia `completadoEn`, así que
 * cambiar a cuenta de empresa hace reaparecer la tarjeta con los seis pasos
 * nuevos y los ya cumplidos marcados.
 */
export default function RecuperarGuia({
  descartada,
  esPersonal,
}: {
  descartada: boolean
  esPersonal: boolean
}) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)

  async function patch(body: Record<string, unknown>) {
    setOcupado(true)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) router.push('/dashboard')
    } catch {
      // Sin conexión o falló la red: se libera el botón en el finally para
      // que puedas reintentar.
    } finally {
      setOcupado(false)
    }
  }

  const boton = (etiqueta: string, cargando: string, body: Record<string, unknown>) => (
    <button
      type="button"
      onClick={() => patch(body)}
      disabled={ocupado}
      className="mt-3 rounded-lg border border-linea px-3 py-1.5 text-sm font-medium text-tinta hover:bg-lienzo disabled:opacity-60"
    >
      {ocupado ? cargando : etiqueta}
    </button>
  )

  return (
    <section className="mt-4 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Guía de configuración</h2>

      {descartada && (
        <div>
          <p className="mt-1 text-sm text-acero">La ocultaste del dashboard. Puedes volver a verla cuando quieras.</p>
          {boton('Volver a mostrarla', 'Mostrando…', { descartado: false })}
        </div>
      )}

      {esPersonal && (
        <div className={descartada ? 'mt-5 border-t border-linea pt-4' : ''}>
          <p className="mt-1 text-sm text-acero">
            Tu cuenta está configurada como un vehículo particular. Si administras una flota, te mostramos lo que falta:
            datos de la empresa, categorías, pauta de mantención, equipo y conductores.
          </p>
          {boton('Cambiar a cuenta de empresa', 'Cambiando…', { tipoCuenta: 'empresa' })}
        </div>
      )}
    </section>
  )
}
