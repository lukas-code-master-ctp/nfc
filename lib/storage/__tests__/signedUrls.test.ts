import { describe, it, expect, vi } from 'vitest'

const { mockFile } = vi.hoisted(() => {
  const mockGetSignedUrl = vi.fn().mockResolvedValue(['https://signed.example/upload'])
  const mockFile = vi.fn(() => ({ getSignedUrl: mockGetSignedUrl }))
  return { mockGetSignedUrl, mockFile }
})
vi.mock('@/lib/firebase/admin', () => ({ adminBucket: { file: mockFile, name: 'bucket' } }))

import { createUploadUrl } from '@/lib/storage/signedUrls'

describe('createUploadUrl', () => {
  it('genera filePath namespaced por owner y vehículo', async () => {
    const res = await createUploadUrl('u1', 'v1', 'permiso.pdf', 'application/pdf')
    expect(res.filePath).toMatch(/^vehicles\/v1\/u1\/.*permiso\.pdf$/)
    expect(res.uploadUrl).toBe('https://signed.example/upload')
  })
})
