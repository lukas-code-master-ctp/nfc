'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase/client'

/**
 * Cierra las sesiones del usuario en todos sus dispositivos. Es la salida de
 * emergencia de la sesión de 14 días: un teléfono perdido se queda afuera.
 */
export default function CerrarSesionesCard() {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cerrar() {
    setBusy(true)
    setError(null)
    const res = await fetch('/api/session/revocar', { method: 'POST' }).catch(() => null)
    if (!res?.ok) {
      setError('No se pudieron cerrar las sesiones. Inténtalo de nuevo.')
      setBusy(false)
      return
    }
    // Sin este signOut quedarías con sesión de Firebase viva pero sin cookie, y
    // `SesionViva` te la volvería a acuñar en la siguiente carga: habrías
    // revocado todos los dispositivos MENOS el que apretó el botón.
    try {
      await signOut(auth)
    } catch {
      /* ignore */
    }
    router.push('/login')
    router.refresh()
  }

  return (
    <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Sesiones activas</h2>
      <p className="mt-1 text-sm text-acero">
        Tu sesión se mantiene abierta hasta 14 días en cada dispositivo donde entres. Si perdiste
        un teléfono o entraste en un computador prestado, ciérralas todas desde acá.
      </p>

      {!confirmando ? (
        <button
          onClick={() => setConfirmando(true)}
          className="mt-4 rounded-lg border border-linea bg-superficie px-4 py-2.5 text-sm font-semibold text-tinta transition-colors hover:bg-lienzo"
        >
          Cerrar sesión en todos los dispositivos
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-tinta">
            Esto también cierra <strong>tu sesión actual</strong>: vas a tener que volver a entrar.
          </p>
          {error && (
            <p role="alert" className="rounded-lg bg-[#FCE7E7] px-3 py-2 text-sm text-[#C81E1E]">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={cerrar}
              disabled={busy}
              className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50"
            >
              {busy ? 'Cerrando…' : 'Sí, cerrar todas'}
            </button>
            <button
              onClick={() => {
                setConfirmando(false)
                setError(null)
              }}
              className="rounded-lg border border-linea bg-superficie px-4 py-2.5 text-sm font-medium text-tinta transition-colors hover:bg-lienzo"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
