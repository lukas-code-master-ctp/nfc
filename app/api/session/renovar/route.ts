import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from '@/lib/auth/constants'
import { verifyIdToken, createSessionCookie } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

/**
 * Renueva la cookie de sesión desde un ID token vigente del cliente.
 *
 * Es un endpoint aparte de `POST /api/session` a propósito: ese llama a
 * `ensureProvisioned` (que lee Firestore) y manda el correo de bienvenida.
 * Este corre en CADA apertura de la app, así que reusarlo pagaría una lectura
 * extra para siempre. **Login provisiona; renovación no.**
 *
 * Tampoco comprueba la revocación, por el mismo costo: eso vive en
 * `getMembership()`. El bucle que eso podría causar se corta en el cliente
 * (`SesionViva`, un solo intento de auto-entrada por carga).
 */
export async function POST(req: NextRequest) {
  const { idToken } = await req.json()
  try {
    await verifyIdToken(idToken)
  } catch {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  }

  let cookie: string
  try {
    cookie = await createSessionCookie(idToken, SESSION_MAX_AGE_MS)
  } catch (e) {
    // Falla ruidosa, igual que en `/api/session`: un token válido que no logra
    // acuñar cookie es un problema de infraestructura (ej. credenciales
    // rotadas), no un token inválido. Enmascararlo como 401 haría ver "todos
    // con token inválido" sin ningún rastro en los logs — justo el caso que
    // este endpoint corre en cada apertura de la app, para todos los usuarios.
    console.error('createSessionCookie', e)
    return NextResponse.json({ error: 'session cookie' }, { status: 500 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS / 1000,
  })
  return res
}
