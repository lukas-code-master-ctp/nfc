import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { getMembership } from '@/lib/auth/membership'
import { getProfile, saveProfile } from '@/lib/data/profile'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await getProfile(user.uid, user.email))
}

export async function PATCH(req: NextRequest) {
  // `getMembership()` y no `getCurrentUser()`: es el único MUTADOR que quedaría
  // fuera del alcance de la revocación, y moverlo lo cierra por el costo de una
  // lectura en un endpoint que casi no se usa. Es seguro porque
  // `ensureProvisioned` garantiza companyId + role desde el primer login.
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const patch: { displayName?: string } = {}

  if (typeof body.displayName === 'string') patch.displayName = body.displayName.trim()

  await saveProfile(m.uid, m.email, patch)
  return NextResponse.json({ ok: true })
}
