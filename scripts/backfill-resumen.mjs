// Backfill one-time de los resúmenes denormalizados del vehículo
// (`resumenDocs` / `resumenMantencion`), que alimentan la tarjeta del dashboard
// sin consultar documentos ni mantenciones por vehículo.
//
// Guarda FECHAS, nunca el estado calculado: el estado cambia solo al pasar la
// medianoche y quedaría viejo apenas se escribe.
//
// SEGURO POR DEFECTO: dry-run (solo lista). Para escribir hay que pasar --apply.
// Idempotente: recalcula desde los datos, se puede correr varias veces.
//
// Uso:
//   node --env-file=.env.local scripts/backfill-resumen.mjs           # dry-run
//   node --env-file=.env.local scripts/backfill-resumen.mjs --apply   # escribe
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const projectId = process.env.FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
if (!projectId || !clientEmail || !privateKey) {
  console.error('Faltan FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
const db = getFirestore()

// Mismo criterio que lib/documents/resumen.ts: las fechas son ISO 'YYYY-MM-DD',
// así que compararlas como texto ordena igual que por calendario.
function resumirDocumentos(docs) {
  let proximoVencimiento = null
  for (const doc of docs) {
    const f = doc.data().fechaVencimiento ?? null
    if (f && (proximoVencimiento === null || f < proximoVencimiento)) proximoVencimiento = f
  }
  return { total: docs.length, proximoVencimiento }
}

// La mantención más reciente por fecha, igual que ultimaMantencion() en
// lib/data/mantenciones.ts. Ante empate de fecha gana el id mayor (comparación
// de strings, igual que allá) — desempate determinista para que este backfill
// y el refrescador de la app siempre elijan la misma mantención.
function ultimaMantencion(docs) {
  let mejor = null
  let mejorId = null
  for (const doc of docs) {
    const d = doc.data()
    if (!d.fecha) continue
    if (!mejor || d.fecha > mejor.fecha || (d.fecha === mejor.fecha && doc.id > mejorId)) {
      mejor = { km: d.km ?? null, fecha: d.fecha }
      mejorId = doc.id
    }
  }
  return mejor
}

const vehiculos = await db.collection('vehicles').get()
let escritos = 0

for (const v of vehiculos.docs) {
  const [docs, mants] = await Promise.all([
    db.collection('documents').where('vehicleId', '==', v.id).get(),
    db.collection('mantenciones').where('vehicleId', '==', v.id).get(),
  ])
  const resumenDocs = resumirDocumentos(docs.docs)
  const resumenMantencion = { ultima: ultimaMantencion(mants.docs) }
  const patente = v.data().patente ?? v.id

  console.log(
    `  ${patente}: ${resumenDocs.total} doc(s), vence ${resumenDocs.proximoVencimiento ?? '—'}` +
      ` · mantención ${resumenMantencion.ultima ? resumenMantencion.ultima.fecha : '—'}`,
  )
  escritos++
  if (APPLY) {
    await v.ref.update({ resumenDocs, resumenMantencion })
  }
}

console.log(`\nVehículos: ${vehiculos.size} · resúmenes calculados: ${escritos}`)
console.log(APPLY ? '\nBackfill aplicado. ✅' : '\n[DRY-RUN] No se escribió nada. Corre con --apply para aplicar.')
process.exit(0)
