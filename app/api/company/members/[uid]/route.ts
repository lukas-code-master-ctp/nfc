import { NextRequest, NextResponse } from 'next/server'
import { getMembership, type Membership } from '@/lib/auth/membership'
import { can, type Role } from '@/lib/auth/roles'
import { getCompany } from '@/lib/data/companies'
import { changeMemberRole, removeMember, setMemberNotificaciones } from '@/lib/data/members'

export const dynamic = 'force-dynamic'

const ROLES: Role[] = ['admin', 'editor', 'viewer']

// Guard estricto: para cambio de rol y baja. Bloquea uno-mismo y al dueño.
type Guard = { error: NextResponse } | { m: Membership }
async function strictGuard(targetUid: string): Promise<Guard> {
  const m = await getMembership()
  if (!m) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  if (!can(m.role, 'team:manage')) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  if (targetUid === m.uid) {
    return { error: NextResponse.json({ error: 'No puedes cambiarte a ti mismo.' }, { status: 403 }) }
  }
  const company = await getCompany(m.companyId)
  if (company?.ownerUid === targetUid) {
    return { error: NextResponse.json({ error: 'No se puede modificar al dueño de la empresa.' }, { status: 403 }) }
  }
  return { m }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params
  const body = await req.json().catch(() => ({}))

  // Rama notificaciones: guard suave (permite al dueño y a uno mismo).
  if (typeof body?.recibeAlertas === 'boolean') {
    const m = await getMembership()
    if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (!can(m.role, 'team:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    try {
      await setMemberNotificaciones(m.companyId, uid, body.recibeAlertas)
    } catch {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    return NextResponse.json({ ok: true })
  }

  // Rama rol: guard estricto.
  const g = await strictGuard(uid)
  if ('error' in g) return g.error
  const role = body?.role as Role
  if (!ROLES.includes(role)) return NextResponse.json({ error: 'Rol inválido.' }, { status: 400 })
  try {
    await changeMemberRole(g.m.companyId, uid, role)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params
  const g = await strictGuard(uid)
  if ('error' in g) return g.error
  try {
    await removeMember(g.m.companyId, uid)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
