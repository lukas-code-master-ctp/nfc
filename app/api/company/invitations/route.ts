import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can, type Role } from '@/lib/auth/roles'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { getCompany } from '@/lib/data/companies'
import { countMembers } from '@/lib/data/members'
import {
  createInvitation,
  hasPendingInvitation,
  countPendingInvitations,
  normalizeEmail,
} from '@/lib/data/invitations'
import { canInvite } from '@/lib/team/capacity'
import { sendInvitationEmail } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'

const ROLES: Role[] = ['admin', 'editor', 'viewer']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'team:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const email = normalizeEmail(String(body?.email ?? ''))
  const role = body?.role as Role
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Correo inválido.' }, { status: 400 })
  if (!ROLES.includes(role)) return NextResponse.json({ error: 'Rol inválido.' }, { status: 400 })

  // ¿El correo ya pertenece a una cuenta TapCar con empresa? (evita huérfanar sus datos)
  try {
    const u = await adminAuth.getUserByEmail(email)
    const udoc = await adminDb.collection('users').doc(u.uid).get()
    if (udoc.exists && udoc.data()?.companyId) {
      return NextResponse.json({ error: 'Ese correo ya pertenece a una cuenta de TapCar.' }, { status: 422 })
    }
  } catch {
    /* getUserByEmail lanza si el correo no existe: está libre */
  }

  if (await hasPendingInvitation(m.companyId, email)) {
    return NextResponse.json({ error: 'Ya hay una invitación pendiente para ese correo.' }, { status: 422 })
  }

  const [members, pending] = await Promise.all([countMembers(m.companyId), countPendingInvitations(m.companyId)])
  if (!canInvite(members, pending)) {
    return NextResponse.json({ error: 'Alcanzaste el máximo de 5 miembros.' }, { status: 409 })
  }

  const invitation = await createInvitation({ companyId: m.companyId, email, role, invitedByUid: m.uid })
  const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/login?invite=${invitation.token}`

  // Enviar el correo es best-effort: si falla, la invitación igual queda creada.
  try {
    const company = await getCompany(m.companyId)
    await sendInvitationEmail(email, {
      companyName: company?.company.razonSocial ?? '',
      role,
      inviterEmail: m.email,
      acceptUrl,
    })
  } catch {
    /* la invitación ya existe; la UI ofrece copiar el enlace */
  }

  return NextResponse.json({ invitation, acceptUrl })
}
