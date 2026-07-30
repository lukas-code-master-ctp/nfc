import { describe, it, expect, vi, beforeEach } from 'vitest'

const userSet = vi.fn()
const userGet = vi.fn()
const companyWhereGet = vi.fn()
const companyAdd = vi.fn()

// adminDb.collection('users').doc(uid) → { get, set }
// adminDb.collection('companies').where(...).limit(1).get() / .add(...)
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => {
      if (name === 'users') return { doc: () => ({ get: userGet, set: userSet }) }
      return {
        where: () => ({ limit: () => ({ get: companyWhereGet }) }),
        add: companyAdd,
        doc: () => ({ set: vi.fn() }),
      }
    },
  },
}))

const findPending = vi.fn()
const markAccepted = vi.fn()
vi.mock('@/lib/data/invitations', () => ({
  findPendingInvitationByEmail: (...a: unknown[]) => findPending(...a),
  markInvitationAccepted: (...a: unknown[]) => markAccepted(...a),
}))

import { ensureProvisioned } from '@/lib/data/companies'

beforeEach(() => {
  userSet.mockReset(); userGet.mockReset(); companyWhereGet.mockReset()
  companyAdd.mockReset(); findPending.mockReset(); markAccepted.mockReset()
})

describe('ensureProvisioned', () => {
  it('no hace nada si el usuario ya tiene companyId', async () => {
    userGet.mockResolvedValue({ exists: true, data: () => ({ companyId: 'c1' }) })
    expect(await ensureProvisioned('u1', 'a@b.cl')).toBe('ya_estaba')
    expect(userSet).not.toHaveBeenCalled()
    expect(findPending).not.toHaveBeenCalled()
  })

  it('une al usuario a la empresa de la invitación pendiente', async () => {
    userGet.mockResolvedValue({ exists: false, data: () => undefined })
    findPending.mockResolvedValue({ id: 'i1', companyId: 'cX', role: 'editor' })
    expect(await ensureProvisioned('u2', 'nuevo@b.cl')).toBe('invitado')
    expect(userSet).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'cX', role: 'editor', email: 'nuevo@b.cl' }),
      { merge: true },
    )
    expect(markAccepted).toHaveBeenCalledWith('i1', 'u2')
    expect(companyAdd).not.toHaveBeenCalled()
  })

  it('sin invitación, crea empresa propia como admin', async () => {
    userGet.mockResolvedValue({ exists: false, data: () => undefined })
    findPending.mockResolvedValue(null)
    companyWhereGet.mockResolvedValue({ empty: true, docs: [] })
    companyAdd.mockResolvedValue({ id: 'cNueva' })
    expect(await ensureProvisioned('u3', 'solo@b.cl')).toBe('creada')
    expect(companyAdd).toHaveBeenCalled()
    expect(userSet).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'cNueva', role: 'admin' }),
      { merge: true },
    )
    expect(markAccepted).not.toHaveBeenCalled()
  })

  it('reutiliza una empresa ya creada a su nombre y sigue siendo cuenta nueva', async () => {
    // Sin users/{uid} con companyId es su primer login, aunque la empresa ya
    // exista: corresponde bienvenida igual.
    userGet.mockResolvedValue({ exists: false, data: () => undefined })
    findPending.mockResolvedValue(null)
    companyWhereGet.mockResolvedValue({ empty: false, docs: [{ id: 'cVieja' }] })
    expect(await ensureProvisioned('u4', 'otro@b.cl')).toBe('creada')
    expect(companyAdd).not.toHaveBeenCalled()
    expect(userSet).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'cVieja', role: 'admin' }),
      { merge: true },
    )
  })
})
