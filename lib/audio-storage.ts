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

async function uploadMp3(path: string, audioBase64: string): Promise<string> {
  const buffer = Buffer.from(audioBase64, 'base64')
  const bucket = adminStorage().bucket()
  const file = bucket.file(path)
  await file.save(buffer, {
    metadata: { contentType: 'audio/mpeg', cacheControl: 'public, max-age=3600' },
  })
  await file.makePublic()
  const base = `https://storage.googleapis.com/${bucket.name}/${path}`
  return `${base}?v=${Date.now()}`
}

export async function uploadLineAudio(
  audioBase64: string,
  dialogId: string,
  lineId: string,
): Promise<string> {
  return uploadMp3(lineAudioPath(dialogId, lineId), audioBase64)
}

export function sceneBedPath(dialogId: string): string {
  return `dialog-audio/${dialogId}/scene-bed.mp3`
}

export async function sceneBedExists(dialogId: string): Promise<boolean> {
  const bucket = adminStorage().bucket()
  const [exists] = await bucket.file(sceneBedPath(dialogId)).exists()
  return exists
}

export async function downloadSceneBed(dialogId: string): Promise<Buffer> {
  const bucket = adminStorage().bucket()
  const [buf] = await bucket.file(sceneBedPath(dialogId)).download()
  return buf
}

export async function uploadSceneBed(audioBase64: string, dialogId: string): Promise<string> {
  return uploadMp3(sceneBedPath(dialogId), audioBase64)
}
