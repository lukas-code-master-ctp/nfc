import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { isAdminEmail } from '@/lib/auth/admin'
import { saveProfile } from '@/lib/data/profile'
import { adminAuth } from '@/lib/firebase/admin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdminEmail(me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { uid } = await params
  const body = await req.json()
  const max = Number(body?.maxVehiculos)
  if (!Number.isFinite(max) || max < 1) {
    return NextResponse.json({ error: 'maxVehiculos inválido (mínimo 1)' }, { status: 400 })
  }

  // saveProfile necesita el email del usuario objetivo si su perfil aún no existe.
  let email = ''
  try {
    email = (await adminAuth.getUser(uid)).email ?? ''
  } catch {
    return NextResponse.json({ error: 'usuario no existe' }, { status: 404 })
  }

  await saveProfile(uid, email, { plan: { maxVehiculos: Math.floor(max) } })
  return NextResponse.json({ ok: true, uid, maxVehiculos: Math.floor(max) })
}
