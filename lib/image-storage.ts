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
  // Einmaliger Pfad + Cache-Bust: sonst liefert der Browser nach „Neu generieren“
  // jahrelang die alte Datei unter derselben URL (max-age war 1 Jahr).
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const safeKey = sectionId.replace(/[^\w.\-]+/g, '_').slice(0, 80)
  const path = `dialog-images/${dialogId}/${safeKey}-${unique}.${ext}`

  const bucket = adminStorage().bucket()
  const file = bucket.file(path)
  await file.save(buffer, {
    metadata: { contentType, cacheControl: 'public, max-age=3600' },
  })
  await file.makePublic()
  return `https://storage.googleapis.com/${bucket.name}/${path}`
}

/** Bildbytes für Export (umgeht Browser-CORS auf Storage-URLs). */
export async function downloadImageByUrl(
  imageUrl: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const dataMatch = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (dataMatch) {
    return {
      buffer: Buffer.from(dataMatch[2], 'base64'),
      contentType: dataMatch[1],
    }
  }

  const bucket = adminStorage().bucket()
  const bucketName = bucket.name
  const storagePrefix = `https://storage.googleapis.com/${bucketName}/`
  const bareUrl = imageUrl.split('?')[0]
  if (bareUrl.startsWith(storagePrefix)) {
    const path = decodeURIComponent(bareUrl.slice(storagePrefix.length))
    const file = bucket.file(path)
    const [buffer] = await file.download()
    const [meta] = await file.getMetadata()
    return {
      buffer,
      contentType: (meta.contentType as string) || 'image/png',
    }
  }

  const res = await fetch(imageUrl)
  if (!res.ok) {
    throw new Error(`Bild nicht erreichbar (${res.status}).`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  return {
    buffer,
    contentType: res.headers.get('content-type') || 'image/png',
  }
}
