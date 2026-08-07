// Migración one-time a la ventana de lanzamiento fija y las suscripciones.
// Reemplaza a `scripts/backfill-prueba.mjs` (que solo hacía el paso 1).
//
// Por cada empresa, hasta tres cambios (ver `scripts/lib/parcheSuscripcion.mjs`
// para la lógica pura, testeada aparte):
//
//   1. Nivela `plan.gratisHasta` a LANZAMIENTO_HASTA si está ausente o es
//      anterior. Es una promoción de lanzamiento: no tiene sentido que quien
//      llegó primero reciba menos días que quien llegó después. Una fecha
//      POSTERIOR a la de lanzamiento se deja intacta — ya le prometieron más.
//   2. `plan.periodicidad` ausente pasa a `null` explícito. Esa distinción
//      (ausente = cuenta anterior al selector, no forzar /plan; `null` =
//      cuenta nueva que debe elegir) deja de ser sostenible con una pasarela:
//      si no sabemos cada cuánto cobrarle a una cuenta, no podemos cobrarle.
//      En `null`, `debeElegirPlan` la manda a elegir con maquinaria ya
//      probada.
//   3. Siembra `plan.suscripcion` si falta, con `proximoCobro` al día
//      siguiente del último día gratis. Sin esto la empresa nunca aparecería
//      en la consulta del cron de cobro (`plan.suscripcion.proximoCobro`):
//      no se le cobraría jamás, y tampoco se la bloquearía.
//
// El parche se escribe con NOTACIÓN DE PUNTO vía `update` (no `set` con
// merge): así nunca pisa el resto del mapa `plan` (`maxVehiculos`, `promo`).
//
// SEGURO POR DEFECTO: dry-run (solo lista). Para escribir hay que pasar
// --apply. Idempotente: cada uno de los tres cambios se aplica solo si hace
// falta, así que correrlo dos veces la segunda vez no toca nada (parche
// vacío por empresa → 0 escrituras).
//
// Uso:
//   node --env-file=.env.local scripts/migrar-suscripciones.mjs           # dry-run
//   node --env-file=.env.local scripts/migrar-suscripciones.mjs --apply   # escribe
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { calcularParche, LANZAMIENTO_HASTA } from './lib/parcheSuscripcion.mjs'

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

function describirCambio(clave, valor) {
  if (clave === 'plan.gratisHasta') return `gratisHasta → ${valor}`
  if (clave === 'plan.periodicidad') return 'periodicidad ausente → null (deberá elegir plan)'
  if (clave === 'plan.suscripcion') return `suscripcion sembrada (próximo cobro ${valor.proximoCobro})`
  return `${clave} → ${JSON.stringify(valor)}`
}

const empresas = await db.collection('companies').get()
let porActualizar = 0
let alDia = 0
// Las que ya tenían prometido MÁS que la ventana de lanzamiento. Se listan
// aparte porque el detalle de abajo solo muestra lo que cambia, así que una
// fecha respetada es invisible: no habría forma de distinguir "se conservó a
// propósito" de "no se miró". Y esa es exactamente la garantía que hay que
// poder confirmar antes de autorizar la escritura.
const conservadas = []

for (const c of empresas.docs) {
  const plan = c.data().plan
  const nombre = c.data().company?.razonSocial || c.id
  const patch = calcularParche(plan)
  const claves = Object.keys(patch)

  const gratisHastaActual = plan?.gratisHasta
  if (gratisHastaActual && gratisHastaActual > LANZAMIENTO_HASTA) {
    conservadas.push(`  ${nombre}: ${gratisHastaActual} (posterior al lanzamiento, se respeta)`)
  }

  if (claves.length === 0) {
    alDia++
    continue
  }

  const detalle = claves.map((k) => describirCambio(k, patch[k])).join(' · ')
  console.log(`  ${nombre}: ${detalle}`)
  porActualizar++
  if (APPLY) {
    await c.ref.update(patch)
  }
}

if (conservadas.length > 0) {
  console.log(`\nCon fecha propia posterior al ${LANZAMIENTO_HASTA}, NO se tocan:`)
  for (const linea of conservadas) console.log(linea)
}

console.log(
  `\nEmpresas: ${empresas.size} · por actualizar: ${porActualizar} · ya al día: ${alDia}`,
)
console.log(
  APPLY
    ? '\nMigración aplicada. ✅'
    : '\n[DRY-RUN] No se escribió nada. Corre con --apply para aplicar.',
)
process.exit(0)
