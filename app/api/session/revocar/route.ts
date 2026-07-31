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

  // 1) El dispositivo perdido pierde la capacidad de emitir tokens nuevos.
  await revokeRefreshTokens(m.uid)
  // 2) Barrera inmediata para los datos: `getMembership()` la comprueba.
  await revocarSesiones(m.uid, instanteDeCorte(Date.now()))

  // 3) Revocar te incluye a ti. El cliente además hace signOut() de Firebase.
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE)
  return res
}
