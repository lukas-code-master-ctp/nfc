// Normalización one-time de las marcas de la flota existente.
//
// Hasta ahora la marca se guardaba tal cual la escribía el usuario, sin ni
// siquiera un trim, así que conviven "subaru", "Subaru" y " Subaru " como
// valores distintos. Esto las lleva a la forma canónica de la librería.
//
// SEGURO POR DEFECTO: dry-run (solo lista). Para escribir hay que pasar --apply.
// Idempotente: correrlo dos veces no hace nada la segunda.
//
// Uso:
//   node --env-file=.env.local scripts/normalizar-marcas.mjs           # dry-run
//   node --env-file=.env.local scripts/normalizar-marcas.mjs --apply   # escribe
//
// OJO: la lista y la función de abajo son una COPIA de `lib/vehicles/marcas.ts`,
// que es la fuente de verdad. Los scripts son .mjs y no pueden importar el
// TypeScript de lib/. Hay un test que falla si las dos listas se separan
// (`lib/vehicles/__tests__/marcas.test.ts`); si agregas una marca acá, agrégala
// también allá.
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const MARCAS = [
  'Alfa Romeo', 'Audi', 'BAIC', 'Bajaj', 'BMW', 'BYD', 'Cadillac', 'Changan',
  'Chery', 'Chevrolet', 'Chrysler', 'Citroën', 'DFSK', 'Dodge', 'Dongfeng',
  'DS', 'Fiat', 'Ford', 'Foton', 'Freightliner', 'Geely', 'GMC', 'Great Wall',
  'Haval', 'Hino', 'Honda', 'Hyundai', 'International', 'Isuzu', 'Iveco',
  'JAC', 'Jaecoo', 'Jaguar', 'Jeep', 'Jetour', 'Kawasaki', 'Kia', 'Land Rover',
  'Lexus', 'Mack', 'Mahindra', 'MAN', 'Maxus', 'Mazda', 'Mercedes-Benz', 'MG',
  'MINI', 'Mitsubishi', 'Nissan', 'Omoda', 'Opel', 'Peugeot', 'Porsche', 'RAM',
  'Renault', 'Scania', 'SEAT', 'Shineray', 'Škoda', 'Smart', 'SsangYong',
  'Subaru', 'Suzuki', 'Tata', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo',
  'Yamaha',
]

// Copia de `normalizarBusqueda` + `claveMarca` + `normalizarMarca` de lib/.
// Ver el aviso de arriba. `claveMarca` deja solo caracteres alfanuméricos
// (además de minúsculas/sin acentos/espacios colapsados) para que
// "MERCEDES BENZ" (con espacio) calce con "Mercedes-Benz" (con guion) — la
// puntuación no debería impedir el reconocimiento de una marca conocida.
const normalizarBusqueda = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

const claveMarca = (s) => normalizarBusqueda(s).replace(/[^a-z0-9]/g, '')

function normalizarMarca(raw) {
  const limpio = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (!limpio) return ''
  const n = claveMarca(limpio)
  return MARCAS.find((m) => claveMarca(m) === n) ?? limpio
}

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

const vehiculos = await db.collection('vehicles').get()
// `propuestos` cuenta filas que DEBERÍAN cambiar; `aplicados` cuenta las que
// EFECTIVAMENTE se escribieron. Son el mismo número en un dry-run exitoso o en
// un --apply sin fallos, pero divergen si un update() lanza a mitad de
// camino: sin esta distinción (y sin try/catch), ese rechazo no manejado
// mataba el proceso dejando las escrituras previas ya hechas, sin decir
// cuáles alcanzaron a aplicarse. El script es idempotente, así que
// re-correrlo arregla el resto — pero eso hay que poder saberlo sin leer un
// stack trace.
let propuestos = 0
let aplicados = 0
const fallidos = []

for (const v of vehiculos.docs) {
  const d = v.data()
  const actual = d.marca ?? ''
  const nueva = normalizarMarca(actual)
  if (nueva === actual) continue
  const etiqueta = `${d.patente ?? v.id} (${d.companyId ?? 's/empresa'}): "${actual}" → "${nueva}"`
  console.log(`  ${etiqueta}`)
  propuestos++
  if (!APPLY) continue
  try {
    await v.ref.update({ marca: nueva })
    aplicados++
  } catch (err) {
    fallidos.push(etiqueta)
    console.error(`  ⚠️  Falló al escribir ${d.patente ?? v.id}: ${err.message ?? err}`)
  }
}

console.log(`\nVehículos: ${vehiculos.size} · por normalizar: ${propuestos}`)
if (!APPLY) {
  console.log('\n[DRY-RUN] No se escribió nada. Corre con --apply para aplicar.')
  process.exit(0)
}

console.log(`Aplicados: ${aplicados} de ${propuestos}`)
if (fallidos.length > 0) {
  console.error(`\n${fallidos.length} fila(s) NO se pudieron escribir:`)
  for (const f of fallidos) console.error(`  - ${f}`)
  console.error('\nEl script es idempotente: corrígelo y vuelve a correrlo, solo reintenta lo pendiente. ❌')
  process.exit(1)
}

console.log('\nNormalización aplicada. ✅')
process.exit(0)
