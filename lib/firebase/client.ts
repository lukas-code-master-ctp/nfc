import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

function clientApp() {
  if (getApps().length) return getApp()
  return initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  })
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

export const auth = lazy<Auth>(() => getAuth(clientApp()))
export const db = lazy<Firestore>(() => getFirestore(clientApp()))
export const storage = lazy<FirebaseStorage>(() => getStorage(clientApp()))
