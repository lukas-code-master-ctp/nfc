// Reaplica la configuración CORS del bucket de Cloud Storage para permitir las
// subidas (PUT a signed URL) y lecturas desde nuestros dominios. Necesario cada
// vez que cambia el dominio de la app (ej. al migrar a app.tapcar.cl): sin el
// origin permitido, el PUT del archivo falla con "CORS error" en el navegador.
// Idempotente: hace UNION con lo que ya estuviera configurado (no borra orígenes).
// Uso: node --env-file=.env.local scripts/set-storage-cors.mjs
import { initializeApp, cert } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'

const projectId = process.env.FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
if (!projectId || !clientEmail || !privateKey || !bucketName) {
  console.error('Faltan FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY / NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET')
  process.exit(1)
}

// Orígenes que deben poder subir/leer archivos vía signed URL.
const REQUIRED_ORIGINS = [
  'https://app.tapcar.cl',
  'https://nfc-roan-nine.vercel.app',
  'http://localhost:3000',
]
const REQUIRED_METHODS = ['GET', 'PUT', 'HEAD', 'OPTIONS']
const REQUIRED_HEADERS = ['Content-Type', 'Content-Length', 'Content-Disposition']

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), storageBucket: bucketName })
const bucket = getStorage().bucket()

const [meta] = await bucket.getMetadata()
const current = Array.isArray(meta.cors) ? meta.cors : []
console.log('CORS actual:\n', JSON.stringify(current, null, 2))

const union = (a, b) => [...new Set([...(a ?? []), ...(b ?? [])])]
const cors = [
  {
    origin: union(current.flatMap((r) => r.origin ?? []), REQUIRED_ORIGINS),
    method: union(current.flatMap((r) => r.method ?? []), REQUIRED_METHODS),
    responseHeader: union(current.flatMap((r) => r.responseHeader ?? []), REQUIRED_HEADERS),
    maxAgeSeconds: Math.max(3600, ...current.map((r) => r.maxAgeSeconds ?? 0)),
  },
]

await bucket.setMetadata({ cors })
console.log('\nCORS aplicado:\n', JSON.stringify(cors, null, 2))
console.log('\nListo. Prueba subir un documento desde app.tapcar.cl (puede tardar 1-2 min en propagar).')
process.exit(0)
