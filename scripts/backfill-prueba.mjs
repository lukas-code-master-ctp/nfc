// Backfill one-time del período de prueba para las cuentas que ya existían
// antes del selector de plan: les pone `plan.gratisHasta` a 30 días desde hoy.
//
// NO toca `plan.periodicidad`: tiene que quedar AUSENTE, porque el campo
// presente (aunque sea null) es lo que manda a una cuenta a la pantalla
// obligatoria de elección de plan. Tampoco toca `maxVehiculos`.
//
// SEGURO POR DEFECTO: dry-run (solo lista). Para escribir hay que pasar --apply.
// Idempotente: salta las empresas que ya tienen `gratisHasta`, así que correrlo
// dos veces no le reinicia la prueba a nadie.
//
// Uso:
//   node --env-file=.env.local scripts/backfill-prueba.mjs           # dry-run
//   node --env-file=.env.local scripts/backfill-prueba.mjs --apply    # escribe
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
const DIAS_PRUEBA = 30

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
const db = getFirestore()

function hoyEnChile(now) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(now)
}

function addDias(fechaISO, dias) {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + dias))
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(t.getUTCDate()).padStart(2, '0')
  return `${t.getUTCFullYear()}-${mm}-${dd}`
}

const hasta = addDias(hoyEnChile(new Date()), DIAS_PRUEBA)
const empresas = await db.collection('companies').get()
let actualizadas = 0
let saltadas = 0

for (const c of empresas.docs) {
  const plan = c.data().plan ?? {}
  if (plan.gratisHasta) {
    saltadas++
    continue
  }
  const nombre = c.data().company?.razonSocial || c.id
  console.log(`  ${nombre}: sin fecha → ${hasta}`)
  actualizadas++
  if (APPLY) {
    await c.ref.set({ plan: { gratisHasta: hasta } }, { merge: true })
  }
}

console.log(`\nEmpresas: ${empresas.size} · por actualizar: ${actualizadas} · ya tenían fecha: ${saltadas}`)
console.log(APPLY ? '\nBackfill aplicado. ✅' : '\n[DRY-RUN] No se escribió nada. Corre con --apply para aplicar.')
process.exit(0)
