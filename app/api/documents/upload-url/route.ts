import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getVehicle } from '@/lib/data/vehicles'
import { createUploadUrl } from '@/lib/storage/signedUrls'

export async function POST(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'document:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { vehicleId, fileName, contentType } = await req.json()
  const v = await getVehicle(vehicleId)
  if (!v || v.companyId !== m.companyId) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { uploadUrl, filePath } = await createUploadUrl(m.uid, vehicleId, fileName, contentType)
  return NextResponse.json({ uploadUrl, filePath })
}
