// Crea los índices compuestos de `usages` (bitácora filtrable de /reportes) vía
// la API de administración de Firestore, usando el service account de .env.local.
// Uso: node --env-file=.env.local scripts/deploy-firestore-indexes.mjs
// Idempotente: si un índice ya existe (o está en construcción), lo informa y sigue.
import { GoogleAuth } from 'google-auth-library'

const projectId = process.env.FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
if (!projectId || !clientEmail || !privateKey) {
  console.error('Faltan FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY')
  process.exit(1)
}

// Los 3 índices que necesita listUsagesPage (sin filtro / por conductor / por vehículo).
const INDEXES = [
  {
    nombre: 'companyId + tomadoEn',
    fields: [
      { fieldPath: 'companyId', order: 'ASCENDING' },
      { fieldPath: 'tomadoEn', order: 'DESCENDING' },
    ],
  },
  {
    nombre: 'companyId + driverId + tomadoEn',
    fields: [
      { fieldPath: 'companyId', order: 'ASCENDING' },
      { fieldPath: 'driverId', order: 'ASCENDING' },
      { fieldPath: 'tomadoEn', order: 'DESCENDING' },
    ],
  },
  {
    nombre: 'companyId + vehicleId + tomadoEn',
    fields: [
      { fieldPath: 'companyId', order: 'ASCENDING' },
      { fieldPath: 'vehicleId', order: 'ASCENDING' },
      { fieldPath: 'tomadoEn', order: 'DESCENDING' },
    ],
  },
]

const auth = new GoogleAuth({
  credentials: { client_email: clientEmail, private_key: privateKey },
  scopes: ['https://www.googleapis.com/auth/datastore'],
})

const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/usages/indexes`

const client = await auth.getClient()
const { token } = await client.getAccessToken()

for (const idx of INDEXES) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ queryScope: 'COLLECTION', fields: idx.fields }),
  })
  if (res.ok) {
    console.log(`✓ ${idx.nombre} — creado (en construcción; puede tardar unos minutos)`)
    continue
  }
  const body = await res.json().catch(() => ({}))
  const msg = body?.error?.message ?? `HTTP ${res.status}`
  if (res.status === 409 || /already exists/i.test(msg)) {
    console.log(`• ${idx.nombre} — ya existe`)
  } else {
    console.error(`✗ ${idx.nombre} — ${msg}`)
  }
}

console.log('\nListo. Revisa el estado en Firebase Console → Firestore → Índices (deben quedar "Habilitado").')
process.exit(0)
