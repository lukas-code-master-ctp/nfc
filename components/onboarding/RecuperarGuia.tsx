'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RecuperarGuia() {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)

  async function mostrar() {
    setOcupado(true)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descartado: false }),
      })
      if (res.ok) router.push('/dashboard')
    } catch {
      // Sin conexión o falló la red: se libera el botón en el finally.
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Guía de configuración</h2>
      <p className="mt-1 text-sm text-acero">La ocultaste del dashboard. Puedes volver a verla cuando quieras.</p>
      <button
        type="button"
        onClick={mostrar}
        disabled={ocupado}
        className="mt-3 rounded-lg border border-linea px-3 py-1.5 text-sm font-medium text-tinta hover:bg-lienzo disabled:opacity-60"
      >
        {ocupado ? 'Mostrando…' : 'Volver a mostrarla'}
      </button>
    </section>
  )
}
