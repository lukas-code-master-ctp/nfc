import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { doc, setDoc, getDoc } from 'firebase/firestore'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rulesPath = resolve(__dirname, '../../..', 'firestore.rules')

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-nfc',
    firestore: { rules: readFileSync(rulesPath, 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

describe('reglas de firestore', () => {
  describe('vehicles', () => {
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

  describe('documents', () => {
    it('un usuario NO puede leer el documento de otro', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'documents/d2'), {
          ownerUid: 'bob',
          vehicleId: 'v',
          patente: 'X',
        })
      })
      const alice = testEnv.authenticatedContext('alice').firestore()
      await assertFails(getDoc(doc(alice, 'documents/d2')))
    })

    it('un usuario NO puede crear un documento a nombre de otro', async () => {
      const alice = testEnv.authenticatedContext('alice').firestore()
      await assertFails(
        setDoc(doc(alice, 'documents/d3'), { ownerUid: 'bob', vehicleId: 'v' }),
      )
    })

    it('el propietario puede crear su propio documento', async () => {
      const alice = testEnv.authenticatedContext('alice').firestore()
      await assertSucceeds(
        setDoc(doc(alice, 'documents/d1'), { ownerUid: 'alice', vehicleId: 'v' }),
      )
    })
  })

  describe('users', () => {
    it('un usuario NO puede leer el documento de usuario de otro', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users/bob'), { name: 'Bob' })
      })
      const alice = testEnv.authenticatedContext('alice').firestore()
      await assertFails(getDoc(doc(alice, 'users/bob')))
    })

    it('el usuario puede leer su propio documento', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users/alice'), { name: 'Alice' })
      })
      const alice = testEnv.authenticatedContext('alice').firestore()
      await assertSucceeds(getDoc(doc(alice, 'users/alice')))
    })
  })

  describe('unauthenticated access', () => {
    it('un usuario NO autenticado NO puede leer vehículos', async () => {
      const anon = testEnv.unauthenticatedContext().firestore()
      await assertFails(getDoc(doc(anon, 'vehicles/v1')))
    })

    it('un usuario NO autenticado NO puede crear vehículos', async () => {
      const anon = testEnv.unauthenticatedContext().firestore()
      await assertFails(setDoc(doc(anon, 'vehicles/vX'), { ownerUid: 'anon', patente: 'TEST' }))
    })
  })
})
