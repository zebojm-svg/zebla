import { GoogleAuth } from 'google-auth-library'

let auth: GoogleAuth | null = null

function getAuth(): GoogleAuth | null {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const projectId = process.env.FIREBASE_PROJECT_ID
  if (!clientEmail || !privateKey || !projectId) return null

  if (!auth) {
    auth = new GoogleAuth({
      credentials: { client_email: clientEmail, private_key: privateKey, project_id: projectId },
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    })
  }
  return auth
}

export async function getGoogleAccessToken(): Promise<string | null> {
  const googleAuth = getAuth()
  if (!googleAuth) return null
  const client = await googleAuth.getClient()
  const token = await client.getAccessToken()
  return token.token ?? null
}

export function isGoogleCloudConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  )
}
