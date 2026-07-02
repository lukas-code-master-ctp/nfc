// scripts/migrate-multitenant.mjs
// Migración one-time a multi-tenant. Idempotente: si un user ya tiene companyId, se salta.
// Por cada user: crea su company (con su company/plan actuales), lo marca admin,
// y estampa companyId + createdByUid en sus vehicles y documents.
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const projectId = process.env.FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
if (!projectId || !clientEmail || !privateKey) {
  console.error('Faltan FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY')
  process.exit(1)
}
if (!getApps().length) initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
const db = getFirestore()

const DEFAULT_PLAN = { maxVehiculos: 3 }
const EMPTY_COMPANY = { razonSocial: '', rut: '', giro: '', direccion: '', telefono: '' }

async function stampCollection(col, uid, companyId) {
  const snap = await db.collection(col).where('ownerUid', '==', uid).get()
  let n = 0
  for (const doc of snap.docs) {
    if (doc.data().companyId) continue
    await doc.ref.update({ companyId, createdByUid: uid })
    n++
  }
  return n
}

async function main() {
  const users = await db.collection('users').get()
  let migrated = 0
  for (const u of users.docs) {
    const d = u.data()
    if (d.companyId) { console.log(`- ${u.id}: ya migrado, skip`); continue }
    const companyRef = await db.collection('companies').add({
      ownerUid: u.id,
      company: { ...EMPTY_COMPANY, ...(d.company ?? {}) },
      plan: { ...DEFAULT_PLAN, ...(d.plan ?? {}) },
      createdAt: new Date().toISOString(),
    })
    await u.ref.set({ companyId: companyRef.id, role: 'admin' }, { merge: true })
    const v = await stampCollection('vehicles', u.id, companyRef.id)
    const docs = await stampCollection('documents', u.id, companyRef.id)
    console.log(`+ ${u.id} → company ${companyRef.id} (${v} vehículos, ${docs} documentos)`)
    migrated++
  }
  // Vehículos/documentos sin dueño en users (por si acaso): reportar, no tocar.
  console.log(`Listo. ${migrated} usuario(s) migrado(s).`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
