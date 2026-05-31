import { initializeApp, getApps, cert, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

let app: App

function getFirebaseAdmin(): App {
  if (getApps().length) {
    return getApps()[0]!
  }

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin nicht konfiguriert. FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL und FIREBASE_PRIVATE_KEY setzen.',
    )
  }

  app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET ?? `${projectId}.firebasestorage.app`,
  })

  return app
}

export function adminAuth() {
  return getAuth(getFirebaseAdmin())
}

let dbInstance: Firestore | null = null

export function adminDb() {
  if (!dbInstance) {
    dbInstance = getFirestore(getFirebaseAdmin())
    dbInstance.settings({ ignoreUndefinedProperties: true })
  }
  return dbInstance
}

export function adminStorage() {
  return getStorage(getFirebaseAdmin())
}
