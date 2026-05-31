import { adminStorage } from './firebase-admin.js'

export function lineAudioPath(dialogId: string, lineId: string): string {
  return `dialog-audio/${dialogId}/${lineId}.mp3`
}

export async function downloadLineAudio(dialogId: string, lineId: string): Promise<Buffer> {
  const bucket = adminStorage().bucket()
  const file = bucket.file(lineAudioPath(dialogId, lineId))
  const [buf] = await file.download()
  return buf
}

export async function uploadLineAudio(
  audioBase64: string,
  dialogId: string,
  lineId: string,
): Promise<string> {
  const buffer = Buffer.from(audioBase64, 'base64')
  const path = lineAudioPath(dialogId, lineId)

  const bucket = adminStorage().bucket()
  const file = bucket.file(path)
  await file.save(buffer, {
    metadata: { contentType: 'audio/mpeg', cacheControl: 'public, max-age=31536000' },
  })
  await file.makePublic()
  return `https://storage.googleapis.com/${bucket.name}/${path}`
}
