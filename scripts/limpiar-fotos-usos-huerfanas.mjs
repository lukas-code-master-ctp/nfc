// Barrido one-time: elimina de Cloud Storage las fotos de bitácora (tablero,
// cabina, foto de daño) que quedaron HUÉRFANAS por borrados anteriores al fix
// de cascada (deleteVehicle/deleteCompanyCascade ahora sí limpian estas fotos).
//
// Una foto es huérfana si vive bajo `vehicles/{id}/usages/...` en Storage y
// NINGÚN doc de la colección `usages` la referencia (fotos.tablero/cabina o
// dano.fotoPath).
//
// SEGURO POR DEFECTO: corre en modo dry-run (solo lista lo que borraría).
// Para borrar de verdad hay que pasar --apply. Irreversible.
//
// Uso:
//   node --env-file=.env.local scripts/limpiar-fotos-usos-huerfanas.mjs           # dry-run
//   node --env-file=.env.local scripts/limpiar-fotos-usos-huerfanas.mjs --apply   # borra
import { initializeApp, cert } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'
import { getFirestore } from 'firebase-admin/firestore'

const projectId = process.env.FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
if (!projectId || !clientEmail || !privateKey || !bucketName) {
  console.error('Faltan FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY / NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), storageBucket: bucketName })
const db = getFirestore()
const bucket = getStorage().bucket()

// 1) Rutas referenciadas por algún uso vigente (las que NO hay que tocar).
const enUso = new Set()
const snap = await db.collection('usages').get()
for (const doc of snap.docs) {
  const d = doc.data()
  if (d.fotos?.tablero) enUso.add(d.fotos.tablero)
  if (d.fotos?.cabina) enUso.add(d.fotos.cabina)
  if (d.dano?.fotoPath) enUso.add(d.dano.fotoPath)
}
console.log(`Usos en Firestore: ${snap.size} · fotos referenciadas: ${enUso.size}`)

// 2) Archivos de fotos de uso en Storage: vehicles/{id}/usages/...
const [files] = await bucket.getFiles({ prefix: 'vehicles/' })
const fotosDeUso = files.filter((f) => f.name.includes('/usages/'))
const huerfanas = fotosDeUso.filter((f) => !enUso.has(f.name))
console.log(`Fotos de uso en Storage: ${fotosDeUso.length} · huérfanas: ${huerfanas.length}`)

if (huerfanas.length === 0) {
  console.log('\nNada que limpiar. ✅')
  process.exit(0)
}

console.log('\nHuérfanas:')
for (const f of huerfanas) console.log(`  ${f.name}`)

if (!APPLY) {
  console.log(`\n[DRY-RUN] No se borró nada. Vuelve a correr con --apply para eliminar estas ${huerfanas.length} fotos.`)
  process.exit(0)
}

let borradas = 0
for (const f of huerfanas) {
  await f.delete({ ignoreNotFound: true })
  borradas++
}
console.log(`\nBorradas ${borradas} fotos huérfanas. ✅`)
process.exit(0)
