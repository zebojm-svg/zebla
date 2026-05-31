import 'dotenv/config'
import { GoogleAuth } from 'google-auth-library'

const auth = new GoogleAuth({
  credentials: {
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    project_id: process.env.FIREBASE_PROJECT_ID,
  },
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
})

const client = await auth.getClient()
const token = (await client.getAccessToken()).token

const res = await fetch('https://texttospeech.googleapis.com/v1/voices', {
  headers: { Authorization: `Bearer ${token}` },
})
const data = await res.json()
const fa = (data.voices ?? []).filter((v) =>
  v.languageCodes?.some((c) => c.toLowerCase().startsWith('fa')),
)
console.log('fa voices:', fa.length)
for (const v of fa) {
  console.log(`  ${v.name} -> ${v.languageCodes.join(', ')}`)
}
