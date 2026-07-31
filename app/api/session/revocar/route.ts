import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/constants'
import { getMembership } from '@/lib/auth/membership'
import { revokeRefreshTokens } from '@/lib/firebase/admin'
import { revocarSesiones } from '@/lib/data/profile'
import { instanteDeCorte } from '@/lib/auth/revocacion'

export const dynamic = 'force-dynamic'

/**
 * Cierra todas las sesiones del usuario, en todos sus dispositivos.
 *
 * Es lo que vuelve segura la ventana de 14 días: sin esto, un teléfono perdido
 * conserva acceso dos semanas y no hay forma de matarlo.
 */
export async function POST() {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // El orden importa y no se cambia: primero los refresh tokens, después
  // Firestore. Así, si algo falla a mitad de camino, falla hacia el lado
  // seguro — en el peor caso los tokens quedan revocados pero el corte de
  // Firestore no se escribió, que dispara el 500 y "vuelve a intentar": nunca
  // el caso inverso (Firestore cortado pero tokens vivos, que dejaría al
  // dispositivo perdido con acceso). Envuelto en try/catch —igual que
  // `/api/session` y `/api/session/renovar`— porque sin él un fallo a mitad
  // de camino queda sin rastro en los logs: el usuario ve "No se pudieron
  // cerrar las sesiones" (o sea, se le dice que no pasó nada cuando pasó la
  // mitad) y no hay ningún `console.error` para diagnosticarlo.
  try {
    // 1) El dispositivo perdido pierde la capacidad de emitir tokens nuevos.
    await revokeRefreshTokens(m.uid)
    // 2) Barrera inmediata para los datos: `getMembership()` la comprueba.
    await revocarSesiones(m.uid, instanteDeCorte(Date.now()))
  } catch (e) {
    console.error('revocar sesiones', e)
    return NextResponse.json({ error: 'no se pudieron cerrar las sesiones' }, { status: 500 })
  }

  // 3) Revocar te incluye a ti. El cliente además hace signOut() de Firebase.
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE)
  return res
}
