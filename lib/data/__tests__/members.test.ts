import { describe, it, expect, vi, beforeEach } from 'vitest'

const usersWhereGet = vi.fn()
const docUpdate = vi.fn()
const docDelete = vi.fn()
const docGet = vi.fn()
const getUser = vi.fn()

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      where: () => ({ get: usersWhereGet }),
      doc: () => ({ get: docGet, update: docUpdate, delete: docDelete }),
    }),
  },
  adminAuth: { getUser: (...a: unknown[]) => getUser(...a) },
}))

import {
  listMembers,
  countMembers,
  changeMemberRole,
  removeMember,
  resolveRecibeAlertas,
  pickRecipientEmails,
} from '@/lib/data/members'

beforeEach(() => {
  usersWhereGet.mockReset(); docUpdate.mockReset(); docDelete.mockReset(); docGet.mockReset(); getUser.mockReset()
})

describe('listMembers', () => {
  it('marca al dueño y usa el email del doc', async () => {
    usersWhereGet.mockResolvedValue({
      docs: [
        { id: 'owner', data: () => ({ email: 'o@b.cl', displayName: 'Jefe', role: 'admin' }) },
        { id: 'u2', data: () => ({ email: 'e@b.cl', displayName: '', role: 'editor' }) },
      ],
    })
    const res = await listMembers('c1', 'owner')
    expect(res.find((m) => m.uid === 'owner')?.isOwner).toBe(true)
    expect(res.find((m) => m.uid === 'u2')?.isOwner).toBe(false)
    expect(getUser).not.toHaveBeenCalled()
  })

  it('resuelve el email desde Auth si falta en el doc', async () => {
    usersWhereGet.mockResolvedValue({
      docs: [{ id: 'u3', data: () => ({ displayName: '', role: 'viewer' }) }],
    })
    getUser.mockResolvedValue({ email: 'desde-auth@b.cl' })
    const res = await listMembers('c1', 'owner')
    expect(res[0].email).toBe('desde-auth@b.cl')
  })
})

describe('countMembers', () => {
  it('cuenta los docs', async () => {
    usersWhereGet.mockResolvedValue({ size: 3, docs: [] })
    expect(await countMembers('c1')).toBe(3)
  })
})

describe('changeMemberRole', () => {
  it('rechaza si el target es de otra empresa', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'otra' }) })
    await expect(changeMemberRole('c1', 'u2', 'editor')).rejects.toThrow('forbidden')
  })
  it('actualiza el rol si pertenece', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1' }) })
    await changeMemberRole('c1', 'u2', 'editor')
    expect(docUpdate).toHaveBeenCalledWith({ role: 'editor' })
  })
})

describe('removeMember', () => {
  it('borra el doc si pertenece', async () => {
    docGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1' }) })
    await removeMember('c1', 'u2')
    expect(docDelete).toHaveBeenCalled()
  })
})

describe('pickRecipientEmails', () => {
  const base = { displayName: '', role: 'viewer' as const, isOwner: false }
  it('toma solo los que reciben y tienen email, deduplicado', () => {
    const emails = pickRecipientEmails([
      { uid: 'a', email: 'a@x.cl', recibeAlertas: true, ...base },
      { uid: 'b', email: 'b@x.cl', recibeAlertas: false, ...base },
      { uid: 'c', email: '', recibeAlertas: true, ...base },
      { uid: 'd', email: 'a@x.cl', recibeAlertas: true, ...base },
    ])
    expect(emails).toEqual(['a@x.cl'])
  })
  it('lista vacía si nadie recibe', () => {
    expect(pickRecipientEmails([{ uid: 'a', email: 'a@x.cl', recibeAlertas: false, ...base }])).toEqual([])
  })
})

describe('resolveRecibeAlertas', () => {
  it('respeta el valor explícito true', () => {
    expect(resolveRecibeAlertas(true, false)).toBe(true)
  })
  it('respeta el valor explícito false aunque sea el dueño', () => {
    expect(resolveRecibeAlertas(false, true)).toBe(false)
  })
  it('sin valor: el dueño recibe por defecto', () => {
    expect(resolveRecibeAlertas(undefined, true)).toBe(true)
  })
  it('sin valor: un no-dueño no recibe por defecto', () => {
    expect(resolveRecibeAlertas(undefined, false)).toBe(false)
  })
})
