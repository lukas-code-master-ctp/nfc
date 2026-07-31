'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { onIdTokenChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase/client'

/**
 * Mantiene viva la cookie de sesión del servidor.
 *
 * La sesión de Firebase en el CLIENTE no expira nunca (vive en IndexedDB con el
 * refresh token); la del servidor sí. Sin este componente nada vuelve a emitir
 * la cookie después del login: vive 14 días y muere, y el usuario termina
 * expulsado mientras su navegador sigue perfectamente autenticado. Ese era el
 * bug original, cuando la cookie duraba una hora.
 *
 * `onIdTokenChanged` dispara al montar, al iniciar y cerrar sesión, y cada vez
 * que Firebase refresca el token (~cada hora). Así la cookie se renueva sola
 * mientras la app está abierta, y cada apertura corre la ventana de 14 días
 * hacia adelante.
 *
 * `autoEntrar` se usa solo en `/login`: si llegas ahí con una sesión de Firebase
 * viva, te acuña la cookie y entras sin escribir nada.
 */
export default function SesionViva({ autoEntrar = false }: { autoEntrar?: boolean }) {
  const router = useRouter()
  // Un solo intento de auto-entrada por carga. Sin esto, una sesión revocada
  // entra en bucle: renovamos la cookie, el dashboard rebota al login, y el
  // componente vuelve a renovar. El ID token ya cacheado del cliente sigue
  // siendo válido hasta una hora después de revocar, así que el bucle es real,
  // no hipotético.
  const yaEntro = useRef(false)

  useEffect(
    () =>
      onIdTokenChanged(auth, async (user) => {
        if (!user) {
          // Sin usuario de Firebase (cerró sesión, o le revocaron el refresh
          // token): el servidor no debe conservar una cookie viva.
          await fetch('/api/session', { method: 'DELETE' }).catch(() => {})
          return
        }
        try {
          const idToken = await user.getIdToken()
          const res = await fetch('/api/session/renovar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          })
          if (!res.ok) return
          if (autoEntrar && !yaEntro.current) {
            yaEntro.current = true
            router.replace('/dashboard')
          }
        } catch {
          // Best-effort: una renovación fallida no puede sacar al usuario ni
          // romper la pantalla. Se reintenta en el próximo evento de token o en
          // la próxima carga.
        }
      }),
    [autoEntrar, router],
  )

  return null
}
