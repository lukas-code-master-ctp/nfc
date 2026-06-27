import { adminBucket } from '@/lib/firebase/admin'
import { nanoid } from 'nanoid'

export async function createUploadUrl(
  ownerUid: string,
  vehicleId: string,
  fileName: string,
  contentType: string,
): Promise<{ uploadUrl: string; filePath: string }> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = `vehicles/${vehicleId}/${ownerUid}/${nanoid(8)}-${safeName}`
  const [uploadUrl] = await adminBucket.file(filePath).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 10 * 60 * 1000,
    contentType,
  })
  return { uploadUrl, filePath }
}

export async function createReadUrl(filePath: string): Promise<string> {
  const [url] = await adminBucket.file(filePath).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 15 * 60 * 1000,
  })
  return url
}
