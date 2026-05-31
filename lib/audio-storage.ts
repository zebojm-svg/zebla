import { adminStorage } from './firebase-admin.js'

export async function uploadLineAudio(
  audioBase64: string,
  dialogId: string,
  lineId: string,
): Promise<string> {
  const buffer = Buffer.from(audioBase64, 'base64')
  const path = `dialog-audio/${dialogId}/${lineId}.mp3`

  const bucket = adminStorage().bucket()
  const file = bucket.file(path)
  await file.save(buffer, {
    metadata: { contentType: 'audio/mpeg', cacheControl: 'public, max-age=31536000' },
  })
  await file.makePublic()
  return `https://storage.googleapis.com/${bucket.name}/${path}`
}
