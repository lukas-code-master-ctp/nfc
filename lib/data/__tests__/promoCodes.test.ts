import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mismo andamiaje que companies-plan.test.ts, extendido con runTransaction y
// FieldValue.increment: canjearPromo corre dentro de una transacción, así que
// hay que simular tx.get/tx.update/tx.set además de collection().doc().
const mocks = vi.hoisted(() => {
  const promoDocGet = vi.fn()
  const promoDocSet = vi.fn().mockResolvedValue(undefined)
  const promoDocUpdate = vi.fn().mockResolvedValue(undefined)
  const companyDocGet = vi.fn()
  const companyDocSet = vi.fn().mockResolvedValue(undefined)
  const collectionSpy = vi.fn()
  const docSpy = vi.fn()
  const runTransactionMock = vi.fn()
  const incrementMock = vi.fn((n: number) => ({ __increment: n }))
  return {
    promoDocGet,
    promoDocSet,
    promoDocUpdate,
    companyDocGet,
    companyDocSet,
    collectionSpy,
    docSpy,
    runTransactionMock,
    incrementMock,
  }
})

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => {
      mocks.collectionSpy(name)
      return {
        doc: (id: string) => {
          mocks.docSpy(name, id)
          // La referencia lleva `__col` para que el tx fake de cada test sepa
          // a qué colección corresponde cuando se la pasan a tx.get/update/set.
          if (name === 'promoCodes') {
            return { __col: 'promoCodes', set: mocks.promoDocSet, get: mocks.promoDocGet, update: mocks.promoDocUpdate }
          }
          return { __col: 'companies', set: mocks.companyDocSet, get: mocks.companyDocGet }
        },
      }
    },
    runTransaction: mocks.runTransactionMock,
  },
}))

vi.mock('firebase-admin/firestore', () => ({ FieldValue: { increment: mocks.incrementMock } }))

const { createPromoCode, getPromoCode, canjearPromo } = await import('@/lib/data/promoCodes')

beforeEach(() => {
  mocks.promoDocGet.mockReset()
  mocks.promoDocSet.mockClear()
  mocks.promoDocUpdate.mockClear()
  mocks.companyDocGet.mockReset()
  mocks.companyDocSet.mockClear()
  mocks.collectionSpy.mockClear()
  mocks.docSpy.mockClear()
  mocks.runTransactionMock.mockReset()
  mocks.incrementMock.mockClear()
})

/** Arma la transacción fake que usan los tests de canjearPromo: `tx.get`
 *  responde según `__col` de la ref, `tx.update`/`tx.set` quedan como spies. */
function fakeTx(snapshots: { code: unknown; company: unknown }) {
  const txGet = vi.fn(async (ref: { __col: string }) =>
    ref.__col === 'promoCodes' ? snapshots.code : snapshots.company,
  )
  const txUpdate = vi.fn()
  const txSet = vi.fn()
  mocks.runTransactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ get: txGet, update: txUpdate, set: txSet }),
  )
  return { txGet, txUpdate, txSet }
}

describe('createPromoCode', () => {
  it('escribe en el doc cuyo ID es el código canónico, con canjes:0 y activo:true', async () => {
    await createPromoCode(
      {
        codigo: 'LANZAMIENTO',
        descripcion: 'Lanzamiento agosto',
        mesesGratis: 2,
        vehiculosIncluidos: 5,
        expiraEn: null,
        maxCanjes: 50,
      },
      'uid-admin',
    )
    expect(mocks.collectionSpy).toHaveBeenCalledWith('promoCodes')
    expect(mocks.docSpy).toHaveBeenCalledWith('promoCodes', 'LANZAMIENTO')
    expect(mocks.promoDocSet).toHaveBeenCalledWith(
      expect.objectContaining({ canjes: 0, activo: true }),
    )
  })
})

describe('getPromoCode', () => {
  it('mapea `codigo` desde `doc.id`, no desde un campo del documento', async () => {
    mocks.promoDocGet.mockResolvedValue({
      exists: true,
      id: 'LANZAMIENTO',
      data: () => ({
        codigo: 'ESTE_CAMPO_NO_SE_USA',
        descripcion: 'x',
        mesesGratis: 1,
        vehiculosIncluidos: 1,
        activo: true,
        expiraEn: null,
        maxCanjes: null,
        canjes: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    })
    const code = await getPromoCode('LANZAMIENTO')
    expect(code?.codigo).toBe('LANZAMIENTO')
  })

  it('de un doc inexistente devuelve `null`', async () => {
    mocks.promoDocGet.mockResolvedValue({ exists: false })
    const code = await getPromoCode('NO_EXISTE')
    expect(code).toBeNull()
  })
})

describe('canjearPromo', () => {
  const codeSnap = {
    exists: true,
    id: 'LANZAMIENTO',
    data: () => ({
      descripcion: 'x',
      mesesGratis: 2,
      vehiculosIncluidos: 5,
      activo: true,
      expiraEn: null,
      maxCanjes: 50,
      canjes: 10,
      createdAt: '2026-01-01T00:00:00.000Z',
    }),
  }

  it('con un código sano incrementa `canjes` en el código Y escribe `plan.promo` en la empresa, ambos dentro de la misma transacción', async () => {
    const companySnap = { data: () => ({ plan: { maxVehiculos: 3 } }) }
    const { txUpdate, txSet } = fakeTx({ code: codeSnap, company: companySnap })

    const resultado = await canjearPromo({
      companyId: 'c1',
      codigo: 'LANZAMIENTO',
      hoy: '2026-08-01',
      ahoraIso: '2026-08-01T12:00:00.000Z',
    })

    expect(resultado.ok).toBe(true)
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ __col: 'promoCodes' }),
      { canjes: { __increment: 1 } },
    )
    expect(txSet).toHaveBeenCalledWith(
      expect.objectContaining({ __col: 'companies' }),
      { plan: { promo: expect.objectContaining({ codigo: 'LANZAMIENTO' }) } },
      { merge: true },
    )
  })

  it('con la empresa que ya tiene `plan.promo` devuelve `{ ok: false, motivo: "ya_canjeado" }` y no escribe nada', async () => {
    const companySnap = {
      data: () => ({
        plan: {
          maxVehiculos: 3,
          promo: { codigo: 'OTRO', mesesGratis: 1, vehiculosIncluidos: 1, canjeadoEn: '2026-01-01T00:00:00.000Z', hasta: '2026-02-01' },
        },
      }),
    }
    const { txUpdate, txSet } = fakeTx({ code: codeSnap, company: companySnap })

    const resultado = await canjearPromo({
      companyId: 'c1',
      codigo: 'LANZAMIENTO',
      hoy: '2026-08-01',
      ahoraIso: '2026-08-01T12:00:00.000Z',
    })

    expect(resultado).toEqual({ ok: false, motivo: 'ya_canjeado' })
    expect(txUpdate).not.toHaveBeenCalled()
    expect(txSet).not.toHaveBeenCalled()
  })

  it('con un código agotado devuelve `{ ok: false, motivo: "agotado" }`, sin escribir', async () => {
    const agotadoSnap = {
      exists: true,
      id: 'LANZAMIENTO',
      data: () => ({
        descripcion: 'x',
        mesesGratis: 2,
        vehiculosIncluidos: 5,
        activo: true,
        expiraEn: null,
        maxCanjes: 50,
        canjes: 50,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    }
    const companySnap = { data: () => ({ plan: { maxVehiculos: 3 } }) }
    const { txUpdate, txSet } = fakeTx({ code: agotadoSnap, company: companySnap })

    const resultado = await canjearPromo({
      companyId: 'c1',
      codigo: 'LANZAMIENTO',
      hoy: '2026-08-01',
      ahoraIso: '2026-08-01T12:00:00.000Z',
    })

    expect(resultado).toEqual({ ok: false, motivo: 'agotado' })
    expect(txUpdate).not.toHaveBeenCalled()
    expect(txSet).not.toHaveBeenCalled()
  })

  it('lee el código DENTRO de la transacción (no antes), o `maxCanjes` no protege contra dos canjes simultáneos', async () => {
    // La lectura "de afuera" (adminDb.collection('promoCodes').doc(id).get(),
    // sin pasar por tx) queda deliberadamente en un estado que haría fallar el
    // canje si el código la usara: simula el snapshot viejo que otra petición
    // concurrente ya dejó agotado. Si `canjearPromo` leyera por ahí en vez de
    // por `tx.get`, el resultado sería `agotado` en vez de `ok: true`.
    mocks.promoDocGet.mockResolvedValue({
      exists: true,
      id: 'LANZAMIENTO',
      data: () => ({ activo: true, expiraEn: null, maxCanjes: 50, canjes: 50, mesesGratis: 2, vehiculosIncluidos: 5, descripcion: 'x', createdAt: null }),
    })
    const companySnap = { data: () => ({ plan: { maxVehiculos: 3 } }) }
    const { txGet } = fakeTx({ code: codeSnap, company: companySnap })

    const resultado = await canjearPromo({
      companyId: 'c1',
      codigo: 'LANZAMIENTO',
      hoy: '2026-08-01',
      ahoraIso: '2026-08-01T12:00:00.000Z',
    })

    expect(resultado.ok).toBe(true)
    // La lectura del código pasó por `tx.get`, no por un `.get()` suelto.
    expect(txGet).toHaveBeenCalledWith(expect.objectContaining({ __col: 'promoCodes' }))
    expect(mocks.promoDocGet).not.toHaveBeenCalled()
  })

  it('escribe la empresa con `{ merge: true }` (no pisa el resto del plan)', async () => {
    const companySnap = { data: () => ({ plan: { maxVehiculos: 7, periodicidad: 'anual' } }) }
    const { txSet } = fakeTx({ code: codeSnap, company: companySnap })

    await canjearPromo({
      companyId: 'c1',
      codigo: 'LANZAMIENTO',
      hoy: '2026-08-01',
      ahoraIso: '2026-08-01T12:00:00.000Z',
    })

    const [, , opts] = txSet.mock.calls[0]
    expect(opts).toEqual({ merge: true })
  })
})
