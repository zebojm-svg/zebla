import { initializeApp, getApps, cert, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

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
  })

  return app
}

export function adminAuth() {
  return getAuth(getFirebaseAdmin())
}

export function adminDb() {
  return getFirestore(getFirebaseAdmin())
}
