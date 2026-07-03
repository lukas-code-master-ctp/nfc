import { NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getCompany } from '@/lib/data/companies'
import { listMembers } from '@/lib/data/members'
import { listPendingInvitations } from '@/lib/data/invitations'

export const dynamic = 'force-dynamic'

export async function GET() {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'team:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const company = await getCompany(m.companyId)
  const [members, invitations] = await Promise.all([
    listMembers(m.companyId, company?.ownerUid ?? ''),
    listPendingInvitations(m.companyId),
  ])
  return NextResponse.json({
    members,
    invitations: invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt })),
  })
}
