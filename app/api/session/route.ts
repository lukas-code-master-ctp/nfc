import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from '@/lib/auth/constants'
import { verifyIdToken, createSessionCookie } from '@/lib/firebase/admin'
import { ensureProvisioned } from '@/lib/data/companies'
import { sendBienvenidaEmail } from '@/lib/email/resend'

// El `after()` de la bienvenida corre después de responder, pero sigue contando
// contra el límite de ejecución: por eso el tope va explícito, como en las rutas
// de tomar/entregar.
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const { idToken } = await req.json()
  let decoded
  try {
    decoded = await verifyIdToken(idToken)
  } catch {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  }
  const email = decoded.email ?? ''
  // Provisiona al usuario (empresa + rol) si es su primer login.
  const provision = await ensureProvisioned(decoded.uid, email)

  // Bienvenida solo cuando la cuenta se acaba de crear. Va en `after()` para no
  // sumarle la latencia de Resend al primer login —el peor momento para ir
  // lento— y es best-effort: un correo caído no puede impedir entrar.
  if (provision === 'creada' && email) {
    // El try envuelve también la llamada a `after()`, no solo su callback: si
    // `after()` mismo lanzara, la sesión se caería con un 500 y el usuario
    // quedaría sin poder entrar — por un correo de cortesía. Nada de este
    // bloque puede impedir iniciar sesión.
    try {
      after(async () => {
        try {
          await sendBienvenidaEmail(email)
        } catch (e) {
          console.error('correo de bienvenida', e)
        }
      })
    } catch (e) {
      console.error('programar correo de bienvenida', e)
    }
  }

  let sessionCookie: string
  try {
    sessionCookie = await createSessionCookie(idToken, SESSION_MAX_AGE_MS)
  } catch (e) {
    // Falla ruidosa: `LoginForm` distingue `ErrorSesion` por el status y lo
    // muestra. Enmascararlo dejaría al usuario en una pantalla colgada sin
    // ningún diagnóstico, que es el bug que ya se arregló una vez.
    console.error('createSessionCookie', e)
    return NextResponse.json({ error: 'session cookie' }, { status: 500 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS / 1000, // el maxAge de una cookie va en segundos
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE)
  return res
}
