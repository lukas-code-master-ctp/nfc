// TODO(task-12): actualizado al modelo multi-tenant (companyId) sin correr el
// emulador (no disponible en este entorno — requiere Java). Revisar que
// `npm run test:rules` pase en un entorno con emulador antes del cutover.
import { describe, it, beforeAll, afterAll } from 'vitest'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore'

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

// Helper: crea el doc users/{uid} de alice y bob, cada uno en su propia
// empresa, saltándose las reglas (setup de datos, no parte del test).
async function seedUsers() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/alice'), {
      companyId: 'empresa-alice',
      role: 'admin',
    })
    await setDoc(doc(ctx.firestore(), 'users/bob'), {
      companyId: 'empresa-bob',
      role: 'admin',
    })
  })
}

describe('reglas de firestore', () => {
  describe('vehicles', () => {
    it('un usuario puede crear un vehículo de su propia empresa', async () => {
      await seedUsers()
      const alice = testEnv.authenticatedContext('alice').firestore()
      await assertSucceeds(
        setDoc(doc(alice, 'vehicles/v1'), { companyId: 'empresa-alice', patente: 'ABCD12' }),
      )
    })

    it('un usuario NO puede leer el vehículo de otra empresa', async () => {
      await seedUsers()
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'vehicles/v2'), {
          companyId: 'empresa-bob',
          patente: 'XYZ',
        })
      })
      const alice = testEnv.authenticatedContext('alice').firestore()
      await assertFails(getDoc(doc(alice, 'vehicles/v2')))
    })

    it('un usuario NO puede crear un vehículo a nombre de otra empresa', async () => {
      await seedUsers()
      const alice = testEnv.authenticatedContext('alice').firestore()
      await assertFails(
        setDoc(doc(alice, 'vehicles/v3'), { companyId: 'empresa-bob', patente: 'AAAA11' }),
      )
    })

    it('un miembro puede actualizar un campo normal de un vehículo de su propia empresa', async () => {
      await seedUsers()
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'vehicles/v4'), {
          companyId: 'empresa-alice',
          patente: 'ABCD12',
        })
      })
      const alice = testEnv.authenticatedContext('alice').firestore()
      await assertSucceeds(updateDoc(doc(alice, 'vehicles/v4'), { patente: 'ZZZZ99' }))
    })

    it('un miembro NO puede cambiar el companyId de un vehículo a otra empresa', async () => {
      await seedUsers()
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'vehicles/v5'), {
          companyId: 'empresa-alice',
          patente: 'ABCD12',
        })
      })
      const alice = testEnv.authenticatedContext('alice').firestore()
      await assertFails(
        updateDoc(doc(alice, 'vehicles/v5'), { companyId: 'empresa-bob' }),
      )
    })
  })

  describe('documents', () => {
    it('un usuario NO puede leer el documento de otra empresa', async () => {
      await seedUsers()
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'documents/d2'), {
          companyId: 'empresa-bob',
          vehicleId: 'v',
          patente: 'X',
        })
      })
      const alice = testEnv.authenticatedContext('alice').firestore()
      await assertFails(getDoc(doc(alice, 'documents/d2')))
    })

    it('un usuario NO puede crear un documento a nombre de otra empresa', async () => {
      await seedUsers()
      const alice = testEnv.authenticatedContext('alice').firestore()
      await assertFails(
        setDoc(doc(alice, 'documents/d3'), { companyId: 'empresa-bob', vehicleId: 'v' }),
      )
    })

    it('un miembro puede crear un documento de su propia empresa', async () => {
      await seedUsers()
      const alice = testEnv.authenticatedContext('alice').firestore()
      await assertSucceeds(
        setDoc(doc(alice, 'documents/d1'), { companyId: 'empresa-alice', vehicleId: 'v' }),
      )
    })

    it('un miembro puede actualizar un campo normal de un documento de su propia empresa', async () => {
      await seedUsers()
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'documents/d4'), {
          companyId: 'empresa-alice',
          vehicleId: 'v',
        })
      })
      const alice = testEnv.authenticatedContext('alice').firestore()
      await assertSucceeds(updateDoc(doc(alice, 'documents/d4'), { vehicleId: 'v2' }))
    })

    it('un miembro NO puede cambiar el companyId de un documento a otra empresa', async () => {
      await seedUsers()
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'documents/d5'), {
          companyId: 'empresa-alice',
          vehicleId: 'v',
        })
      })
      const alice = testEnv.authenticatedContext('alice').firestore()
      await assertFails(
        updateDoc(doc(alice, 'documents/d5'), { companyId: 'empresa-bob' }),
      )
    })
  })

  describe('companies', () => {
    it('un miembro puede leer su propia empresa', async () => {
      await seedUsers()
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'companies/empresa-alice'), { ownerUid: 'alice' })
      })
      const alice = testEnv.authenticatedContext('alice').firestore()
      await assertSucceeds(getDoc(doc(alice, 'companies/empresa-alice')))
    })

    it('un usuario NO puede leer una empresa de la que no es miembro', async () => {
      await seedUsers()
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'companies/empresa-bob'), { ownerUid: 'bob' })
      })
      const alice = testEnv.authenticatedContext('alice').firestore()
      await assertFails(getDoc(doc(alice, 'companies/empresa-bob')))
    })
  })

  describe('users', () => {
    it('un usuario NO puede leer el documento de usuario de otro', async () => {
      await seedUsers()
      const alice = testEnv.authenticatedContext('alice').firestore()
      await assertFails(getDoc(doc(alice, 'users/bob')))
    })

    it('el usuario puede leer su propio documento', async () => {
      await seedUsers()
      const alice = testEnv.authenticatedContext('alice').firestore()
      await assertSucceeds(getDoc(doc(alice, 'users/alice')))
    })
  })

  describe('unauthenticated access', () => {
    it('un usuario NO autenticado NO puede leer vehículos', async () => {
      await seedUsers()
      const anon = testEnv.unauthenticatedContext().firestore()
      await assertFails(getDoc(doc(anon, 'vehicles/v1')))
    })

    it('un usuario NO autenticado NO puede crear vehículos', async () => {
      const anon = testEnv.unauthenticatedContext().firestore()
      await assertFails(
        setDoc(doc(anon, 'vehicles/vX'), { companyId: 'empresa-alice', patente: 'TEST' }),
      )
    })
  })
})
