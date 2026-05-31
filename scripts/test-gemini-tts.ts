import 'dotenv/config'
import { GoogleAuth } from 'google-auth-library'

const project = process.env.FIREBASE_PROJECT_ID ?? ''
console.log('project', project)

const auth = new GoogleAuth({
  credentials: {
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    project_id: project,
  },
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
})

const token = (await (await auth.getClient()).getAccessToken()).token
if (!token) {
  console.error('no token')
  process.exit(1)
}

const body = {
  input: { text: 'سلام', prompt: 'Read clearly in Persian.' },
  voice: { languageCode: 'fa-ir', name: 'Kore', model_name: 'gemini-2.5-flash-tts' },
  audioConfig: { audioEncoding: 'MP3' },
}

const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 25000)

const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-goog-user-project': project,
  },
  body: JSON.stringify(body),
  signal: controller.signal,
})
clearTimeout(timer)

const data = await res.json()
console.log('HTTP', res.status)
if (data.error) console.log('ERROR:', data.error.message)
else console.log('OK, bytes', data.audioContent?.length)
