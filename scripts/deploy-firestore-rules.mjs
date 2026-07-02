// Despliega firestore.rules usando el service account (mismas credenciales
// FIREBASE_* que la migración), sin necesidad del CLI de Firebase.
// Uso: node --env-file=.env.local scripts/deploy-firestore-rules.mjs
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getSecurityRules } from 'firebase-admin/security-rules'
import { readFileSync } from 'node:fs'

const projectId = process.env.FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
if (!projectId || !clientEmail || !privateKey) {
  console.error('Faltan FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY')
  process.exit(1)
}
if (!getApps().length) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })

const source = readFileSync('firestore.rules', 'utf8')
await getSecurityRules().releaseFirestoreRulesetFromSource(source)
console.log('✓ Reglas de Firestore desplegadas a', projectId)
process.exit(0)
