import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { regenerateToken } from '@/lib/data/vehicles'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'vehicle:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    const publicToken = await regenerateToken(id, m.companyId)
    return NextResponse.json({ publicToken })
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
}
