import { adminStorage } from './firebase-admin.js'

export async function uploadDialogImage(
  dataUrl: string,
  dialogId: string,
  sectionId: string,
): Promise<string> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    throw new Error('Ungültiges Bildformat.')
  }

  const contentType = match[1]
  const buffer = Buffer.from(match[2], 'base64')
  const ext = contentType.includes('jpeg') ? 'jpg' : 'png'
  const path = `dialog-images/${dialogId}/${sectionId}.${ext}`

  const bucket = adminStorage().bucket()
  const file = bucket.file(path)
  await file.save(buffer, {
    metadata: { contentType, cacheControl: 'public, max-age=31536000' },
  })
  await file.makePublic()
  return `https://storage.googleapis.com/${bucket.name}/${path}`
}
