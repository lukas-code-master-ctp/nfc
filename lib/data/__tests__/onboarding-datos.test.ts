import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const set = vi.fn().mockResolvedValue(undefined)
  const doc = vi.fn(() => ({ set }))
  const collection = vi.fn(() => ({ doc }))
  return { set, doc, collection, arrayUnion: vi.fn((v: string) => ({ __arrayUnion: v })) }
})

vi.mock('@/lib/firebase/admin', () => ({ adminDb: { collection: mocks.collection } }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { arrayUnion: mocks.arrayUnion } }))
// companies.ts importa invitations.ts (para ensureProvisioned); lo mockeamos
// para que cargar el módulo no arrastre esa cadena.
vi.mock('@/lib/data/invitations', () => ({
  findPendingInvitationByEmail: vi.fn(),
  markInvitationAccepted: vi.fn(),
}))

const { saveOnboarding } = await import('@/lib/data/companies')

beforeEach(() => {
  mocks.set.mockClear()
  mocks.doc.mockClear()
  mocks.collection.mockClear()
  mocks.arrayUnion.mockClear()
})

describe('saveOnboarding', () => {
  it('escribe el tipo de cuenta anidado bajo "onboarding", con merge', () => {
    return saveOnboarding('c1', { tipoCuenta: 'empresa' }).then(() => {
      expect(mocks.collection).toHaveBeenCalledWith('companies')
      expect(mocks.doc).toHaveBeenCalledWith('c1')
      const [data, opts] = mocks.set.mock.calls[0]
      expect(data).toEqual({ onboarding: { tipoCuenta: 'empresa', completadoEn: null } })
      expect(opts).toEqual({ merge: true })
    })
  })

  it('elegir tipo limpia completadoEn, porque cambiar de personal a empresa suma pasos', async () => {
    await saveOnboarding('c1', { tipoCuenta: 'empresa' })
    const [data] = mocks.set.mock.calls[0] as [{ onboarding: Record<string, unknown> }]
    expect(data.onboarding.completadoEn).toBeNull()
  })

  it('agrega un visto con arrayUnion, para no pisar los que ya estaban', async () => {
    await saveOnboarding('c1', { agregarVisto: 'chip' })
    expect(mocks.arrayUnion).toHaveBeenCalledWith('chip')
    const [data] = mocks.set.mock.calls[0] as [{ onboarding: Record<string, unknown> }]
    expect(data.onboarding.vistos).toEqual({ __arrayUnion: 'chip' })
  })

  it('acepta null explícito para volver a mostrar la tarjeta', async () => {
    await saveOnboarding('c1', { descartadoEn: null })
    const [data] = mocks.set.mock.calls[0] as [{ onboarding: Record<string, unknown> }]
    expect(data.onboarding).toEqual({ descartadoEn: null })
  })

  it('no escribe nada con un patch vacío', async () => {
    await saveOnboarding('c1', {})
    expect(mocks.set).not.toHaveBeenCalled()
  })
})
