import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { getProfile, saveProfile } from '@/lib/data/profile'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await getProfile(user.uid, user.email))
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const patch: { displayName?: string } = {}

  if (typeof body.displayName === 'string') patch.displayName = body.displayName.trim()

  await saveProfile(user.uid, user.email, patch)
  return NextResponse.json({ ok: true })
}
