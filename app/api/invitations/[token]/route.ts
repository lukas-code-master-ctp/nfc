import { NextResponse } from 'next/server'
import { getInvitationByToken } from '@/lib/data/invitations'
import { getCompany } from '@/lib/data/companies'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const inv = await getInvitationByToken(token)
  if (!inv || inv.status !== 'pending' || inv.expiresAt <= new Date().toISOString()) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const company = await getCompany(inv.companyId)
  return NextResponse.json({
    companyName: company?.company.razonSocial ?? '',
    role: inv.role,
    email: inv.email,
  })
}
