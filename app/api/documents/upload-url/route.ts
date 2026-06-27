import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { getVehicle } from '@/lib/data/vehicles'
import { createUploadUrl } from '@/lib/storage/signedUrls'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { vehicleId, fileName, contentType } = await req.json()
  const v = await getVehicle(vehicleId)
  if (!v || v.ownerUid !== user.uid) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { uploadUrl, filePath } = await createUploadUrl(user.uid, vehicleId, fileName, contentType)
  return NextResponse.json({ uploadUrl, filePath })
}
