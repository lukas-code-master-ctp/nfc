// Backfill one-time del kilometraje del vehículo (`kmActual`/`kmActualizadoEn`)
// a partir de los usos que ya tienen km leído por la IA. El odómetro solo sube,
// así que kmActual = el máximo entre los usos; la fecha es la del uso que lo
// aportó (entregadoEn, o createdAt si falta).
//
// SEGURO POR DEFECTO: dry-run (solo lista). Para escribir hay que pasar --apply.
// Idempotente: recalcula desde los usos, se puede correr varias veces.
//
// Uso:
//   node --env-file=.env.local scripts/backfill-km.mjs           # dry-run
//   node --env-file=.env.local scripts/backfill-km.mjs --apply    # escribe
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

// km máximo entre los usos de un vehículo (ignora null/negativos), con su fecha.
function kmDeUsos(docs) {
  let mejor = null
  for (const doc of docs) {
    const d = doc.data()
    const km = d.km
    if (typeof km !== 'number' || !Number.isFinite(km) || km < 0) continue
    if (!mejor || km > mejor.km) mejor = { km, fecha: d.entregadoEn ?? d.createdAt ?? '' }
  }
  return mejor
}

const vehiculos = await db.collection('vehicles').get()
let actualizados = 0
let sinLectura = 0

for (const v of vehiculos.docs) {
  const usos = await db.collection('usages').where('vehicleId', '==', v.id).get()
  const km = kmDeUsos(usos.docs)
  const patente = v.data().patente ?? v.id
  if (!km) {
    sinLectura++
    continue
  }
  const actual = v.data().kmActual ?? null
  if (actual === km.km) continue // ya está al día
  console.log(`  ${patente}: ${actual ?? '—'} → ${km.km} km (${km.fecha || 's/fecha'})`)
  actualizados++
  if (APPLY) {
    await v.ref.update({ kmActual: km.km, kmActualizadoEn: km.fecha || null })
  }
}

console.log(`\nVehículos: ${vehiculos.size} · con lectura por actualizar: ${actualizados} · sin lectura: ${sinLectura}`)
console.log(APPLY ? '\nBackfill aplicado. ✅' : '\n[DRY-RUN] No se escribió nada. Corre con --apply para aplicar.')
process.exit(0)
