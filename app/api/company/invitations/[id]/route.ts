import { NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { revokeInvitation } from '@/lib/data/invitations'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'team:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  try {
    await revokeInvitation(id, m.companyId)
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
