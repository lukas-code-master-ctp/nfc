import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/session'
import { verifyIdToken } from '@/lib/firebase/admin'
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
    after(async () => {
      try {
        await sendBienvenidaEmail(email)
      } catch (e) {
        console.error('correo de bienvenida', e)
      }
    })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, idToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60, // 1h (token de Firebase expira en 1h)
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE)
  return res
}
