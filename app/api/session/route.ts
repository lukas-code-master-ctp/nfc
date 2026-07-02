import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/session'
import { verifyIdToken } from '@/lib/firebase/admin'
import { ensureProvisioned } from '@/lib/data/companies'

export async function POST(req: NextRequest) {
  const { idToken } = await req.json()
  let decoded
  try {
    decoded = await verifyIdToken(idToken)
  } catch {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  }
  // Provisiona al usuario (empresa + rol) si es su primer login.
  await ensureProvisioned(decoded.uid, decoded.email ?? '')
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
