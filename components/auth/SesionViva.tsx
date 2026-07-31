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
 * que YA estaba viva, te acuña la cookie y entras sin escribir nada.
 *
 * `destino` es a dónde navegar al auto-entrar (por defecto `/dashboard`); lo
 * pasa `/login` con la misma ruta que ya usa `LoginForm` (ej. una transferencia
 * pendiente), para no perder el destino cuando la auto-entrada gana la carrera.
 */
// Clave de `sessionStorage` que registra un intento de auto-entrada ya hecho
// en esta pestaña. Exportada solo para que el test pueda leerla/escribirla
// con el mismo nombre — no es parte de la API del componente.
export const CLAVE_INTENTO_AUTO_ENTRADA = 'tapcar:intento-auto-entrada'

// El corte de bucle con `useRef` (más abajo) protege DENTRO de un mismo
// montaje, pero el bucle real remonta el componente (login → dashboard →
// `getMembership()` da null → `redirect('/login')` → se vuelve a montar
// `SesionViva`), y un ref se reinicia en cada montaje: la protección
// desaparece justo cuando hace falta. `sessionStorage` sí sobrevive al
// remontaje dentro de la misma pestaña, así que es lo que de verdad corta el
// bucle entre cargas. NO se puede reemplazar por el `useRef`: no es
// redundante, es la única de las dos protecciones que sobrevive al
// remontaje. Envuelto en try/catch porque algunos navegadores (Safari en
// privado, incógnito, webviews dentro de otras apps) particionan o bloquean
// el storage y lanzan al tocarlo — ahí se degrada a permitir la auto-entrada,
// porque es preferible el riesgo de bucle de hoy a dejar al usuario sin
// forma de entrar.
function intentoAutoEntradaBloqueado(): boolean {
  try {
    return sessionStorage.getItem(CLAVE_INTENTO_AUTO_ENTRADA) === '1'
  } catch {
    return false
  }
}

function marcarIntentoAutoEntrada() {
  try {
    sessionStorage.setItem(CLAVE_INTENTO_AUTO_ENTRADA, '1')
  } catch {
    // Best-effort — ver `intentoAutoEntradaBloqueado`.
  }
}

// Exportada para que `LoginForm` la use tras un login exitoso — ver el
// comentario en `afterAuth` de `components/LoginForm.tsx` sobre por qué ahí y
// no acá. No dupliques este `try/catch` ni el nombre de la clave en otro
// archivo: es la única función que la borra.
export function limpiarIntentoAutoEntrada() {
  try {
    sessionStorage.removeItem(CLAVE_INTENTO_AUTO_ENTRADA)
  } catch {
    // Best-effort — ver `intentoAutoEntradaBloqueado`.
  }
}

export default function SesionViva({
  autoEntrar = false,
  destino,
}: {
  autoEntrar?: boolean
  destino?: string
}) {
  const router = useRouter()
  // Un solo intento de auto-entrada por carga. Sin esto, una sesión revocada
  // entra en bucle: renovamos la cookie, el dashboard rebota al login, y el
  // componente vuelve a renovar. El ID token ya cacheado del cliente sigue
  // siendo válido hasta una hora después de revocar, así que el bucle es real,
  // no hipotético.
  const yaEntro = useRef(false)

  // `onIdTokenChanged` dispara una PRIMERA vez al montar con el estado actual
  // (con usuario si la sesión de Firebase ya estaba viva; `null` si no hay
  // nadie), y de nuevo cada vez que el token cambia (login, logout, refresh
  // horario). Auto-entrar solo tiene sentido para el primer caso: alguien que
  // llega a `/login` con una sesión que YA existía. Si la primera invocación
  // es `null` y una posterior trae usuario, es un login recién hecho a mano en
  // `LoginForm` — que ya navega por su cuenta después de `establishSession`
  // (que además provisiona la cuenta en Firestore). Si acá navegáramos
  // igual iríamos por delante de esa ruta: en una cuenta recién creada,
  // llegaríamos al dashboard antes de que exista `users/{uid}`, `getMembership`
  // devolvería null y el dashboard rebotaría a `/login` — donde este
  // componente se remonta y vuelve a disparar. Y de paso perderíamos `destino`,
  // porque esta carrera no lo conoce del todo (lo pasa `/login`, pero el punto
  // es que la navegación le corresponde a `LoginForm`, no a esta). Por eso solo
  // marcamos "corresponde auto-entrar" en la PRIMERA invocación, y solo si esa
  // trajo usuario. NO simplificar a "si autoEntrar, navega": reintroduce la
  // carrera con `LoginForm`.
  const esPrimeraInvocacion = useRef(true)
  const sesionYaEstabaViva = useRef(false)

  // OJO: acá NO se limpia `CLAVE_INTENTO_AUTO_ENTRADA`, aunque este sea el
  // componente SIN `autoEntrar` (el que vive en el layout de `(app)`). Se
  // intentó así y era el bug: el layout de `(app)` MONTA e HIDRATA durante el
  // rebote de un usuario sin membresía (`removeMember` borra `users/{uid}`
  // pero deja vivo el usuario de Firebase Auth), antes de que el `redirect()`
  // del servidor lo saque. Ese montaje borraba la marca justo cuando hacía
  // falta, y el bucle de la sección de arriba se reabría en cada vuelta:
  // login marca → el layout monta y borra → `getMembership()` da null →
  // `redirect('/login')` → remonta, refs reiniciados, marca ausente → se
  // repite. Infinito. La marca solo se limpia donde la membresía está
  // PROBADA: en `afterAuth` de `components/LoginForm.tsx`, después de que
  // `establishSession` respondió ok (ese POST pasó por `ensureProvisioned`,
  // así que `users/{uid}` existe con certeza). Ver `limpiarIntentoAutoEntrada`
  // más arriba, exportada para ese uso.

  useEffect(
    () =>
      onIdTokenChanged(auth, async (user) => {
        const primera = esPrimeraInvocacion.current
        esPrimeraInvocacion.current = false
        if (primera && user) sesionYaEstabaViva.current = true

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
          if (autoEntrar && sesionYaEstabaViva.current && !yaEntro.current) {
            yaEntro.current = true
            // Ver `intentoAutoEntradaBloqueado`: esto es lo que corta el
            // bucle entre remontajes, no el `yaEntro` de arriba.
            if (!intentoAutoEntradaBloqueado()) {
              marcarIntentoAutoEntrada()
              router.replace(destino ?? '/dashboard')
            }
          }
        } catch {
          // Best-effort: una renovación fallida no puede sacar al usuario ni
          // romper la pantalla. Se reintenta en el próximo evento de token o en
          // la próxima carga.
        }
      }),
    [autoEntrar, destino, router],
  )

  return null
}
