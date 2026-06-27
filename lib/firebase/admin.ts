import { initializeApp, getApps, getApp, cert, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

let _app: App | undefined
function adminApp(): App {
  if (_app) return _app
  _app = getApps().length
    ? getApp()
    : initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      })
  return _app
}

function lazy<T extends object>(factory: () => T): T {
  let inst: T | undefined
  return new Proxy({} as T, {
    get(_t, prop) {
      inst ??= factory()
      const value = (inst as Record<string | symbol, unknown>)[prop]
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(inst)
        : value
    },
  })
}

type Bucket = ReturnType<ReturnType<typeof getStorage>['bucket']>

export const adminAuth = lazy<Auth>(() => getAuth(adminApp()))
export const adminDb = lazy<Firestore>(() => getFirestore(adminApp()))
export const adminBucket = lazy<Bucket>(() => getStorage(adminApp()).bucket())

export async function verifyIdToken(token: string) {
  return getAuth(adminApp()).verifyIdToken(token)
}
