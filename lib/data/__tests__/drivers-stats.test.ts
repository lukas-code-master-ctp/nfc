import { describe, it, expect, vi, beforeEach } from 'vitest'

const docUpdate = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ update: docUpdate }) }) },
}))

import { incrementDriverStats } from '@/lib/data/drivers'

beforeEach(() => { docUpdate.mockReset() })

describe('incrementDriverStats', () => {
  it('incrementa el campo indicado con dot-path', async () => {
    await incrementDriverStats('d1', 'danos')
    const arg = docUpdate.mock.calls[0][0]
    expect(Object.keys(arg)).toEqual(['stats.danos'])
    expect(arg['stats.danos']).toBeDefined() // sentinel FieldValue.increment
  })
})
