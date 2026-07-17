import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getVehicle } from '@/lib/data/vehicles'
import { createDanoUrl } from '@/lib/storage/signedUrls'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'vehicle:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const v = await getVehicle(id)
  if (!v || v.companyId !== m.companyId) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  const contentType = String(body?.contentType ?? 'image/jpeg')
  const { uploadUrl, filePath } = await createDanoUrl(id, contentType)
  return NextResponse.json({ uploadUrl, filePath })
}
