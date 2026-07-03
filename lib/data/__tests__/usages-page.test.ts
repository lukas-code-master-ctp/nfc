import { describe, it, expect, vi, beforeEach } from 'vitest'

const where = vi.fn()
const orderBy = vi.fn()
const startAfter = vi.fn()
const limit = vi.fn()
const get = vi.fn()
const q = { where, orderBy, startAfter, limit, get }
vi.mock('@/lib/firebase/admin', () => ({ adminDb: { collection: () => q } }))

import { listUsagesPage } from '@/lib/data/usages'

function doc(id: string, tomadoEn: string) {
  return { id, data: () => ({ vehicleId: 'v', companyId: 'c1', estado: 'cerrado', tomadoEn }) }
}

beforeEach(() => {
  where.mockReturnValue(q); orderBy.mockReturnValue(q); startAfter.mockReturnValue(q); limit.mockReturnValue(q)
  get.mockReset(); where.mockClear(); orderBy.mockClear(); startAfter.mockClear(); limit.mockClear()
  where.mockReturnValue(q); orderBy.mockReturnValue(q); startAfter.mockReturnValue(q); limit.mockReturnValue(q)
})

describe('listUsagesPage', () => {
  it('sin filtros: solo companyId + orderBy tomadoEn desc + limit', async () => {
    get.mockResolvedValue({ docs: [] })
    await listUsagesPage('c1', {}, 20)
    expect(where).toHaveBeenCalledWith('companyId', '==', 'c1')
    expect(orderBy).toHaveBeenCalledWith('tomadoEn', 'desc')
    expect(limit).toHaveBeenCalledWith(20)
    expect(startAfter).not.toHaveBeenCalled()
  })
  it('con driverId agrega el where; con cursor agrega startAfter', async () => {
    get.mockResolvedValue({ docs: [] })
    await listUsagesPage('c1', { driverId: 'd1', cursor: '2026-01-01' }, 20)
    expect(where).toHaveBeenCalledWith('driverId', '==', 'd1')
    expect(startAfter).toHaveBeenCalledWith('2026-01-01')
  })
  it('nextCursor = tomadoEn del último si la página vino llena', async () => {
    get.mockResolvedValue({ docs: [doc('a', '2026-03-01'), doc('b', '2026-02-01')] })
    const r = await listUsagesPage('c1', {}, 2)
    expect(r.items.map((u) => u.id)).toEqual(['a', 'b'])
    expect(r.nextCursor).toBe('2026-02-01')
  })
  it('nextCursor = null si la página no vino llena', async () => {
    get.mockResolvedValue({ docs: [doc('a', '2026-03-01')] })
    const r = await listUsagesPage('c1', {}, 2)
    expect(r.nextCursor).toBeNull()
  })
})
