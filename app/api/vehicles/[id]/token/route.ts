import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { regenerateToken } from '@/lib/data/vehicles'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const publicToken = await regenerateToken(id, user.uid)
    return NextResponse.json({ publicToken })
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
}
