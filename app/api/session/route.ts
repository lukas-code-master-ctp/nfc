import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/session'
import { verifyIdToken } from '@/lib/firebase/admin'

export async function POST(req: NextRequest) {
  const { idToken } = await req.json()
  try {
    await verifyIdToken(idToken)
  } catch {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 })
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
