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

// Copia de `normalizarBusqueda` + `normalizarMarca` de lib/. Ver el aviso de arriba.
const clave = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

function normalizarMarca(raw) {
  const limpio = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (!limpio) return ''
  const n = clave(limpio)
  return MARCAS.find((m) => clave(m) === n) ?? limpio
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
let cambiados = 0

for (const v of vehiculos.docs) {
  const d = v.data()
  const actual = d.marca ?? ''
  const nueva = normalizarMarca(actual)
  if (nueva === actual) continue
  console.log(`  ${d.patente ?? v.id} (${d.companyId ?? 's/empresa'}): "${actual}" → "${nueva}"`)
  cambiados++
  if (APPLY) await v.ref.update({ marca: nueva })
}

console.log(`\nVehículos: ${vehiculos.size} · por normalizar: ${cambiados}`)
console.log(APPLY ? '\nNormalización aplicada. ✅' : '\n[DRY-RUN] No se escribió nada. Corre con --apply para aplicar.')
process.exit(0)
