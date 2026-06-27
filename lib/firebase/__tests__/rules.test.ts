import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { doc, setDoc, getDoc } from 'firebase/firestore'

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-nfc',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

describe('reglas de firestore', () => {
  it('un usuario puede crear su propio vehículo', async () => {
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(
      setDoc(doc(alice, 'vehicles/v1'), { ownerUid: 'alice', patente: 'ABCD12' }),
    )
  })

  it('un usuario NO puede leer el vehículo de otro', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'vehicles/v2'), { ownerUid: 'bob', patente: 'XYZ' })
    })
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertFails(getDoc(doc(alice, 'vehicles/v2')))
  })

  it('un usuario NO puede crear un vehículo a nombre de otro', async () => {
    const alice = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(alice, 'vehicles/v3'), { ownerUid: 'bob', patente: 'AAAA11' }),
    )
  })
})
