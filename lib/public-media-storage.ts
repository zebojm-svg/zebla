import { adminStorage } from './firebase-admin.js'
import type { PublicCatalogMediaKind } from '../shared/public-catalog.js'

const EXT: Record<PublicCatalogMediaKind, string> = {
  thumbnail: 'jpg',
  video: 'mp4',
  pdf: 'pdf',
}

const CONTENT_TYPE: Record<PublicCatalogMediaKind, string> = {
  thumbnail: 'image/jpeg',
  video: 'video/mp4',
  pdf: 'application/pdf',
}

export async function uploadPublicCatalogMedia(
  itemId: string,
  kind: PublicCatalogMediaKind,
  buffer: Buffer,
  contentType?: string,
): Promise<string> {
  const ext = EXT[kind]
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const path = `public-catalog/${itemId}/${kind}-${unique}.${ext}`
  const bucket = adminStorage().bucket()
  const file = bucket.file(path)
  const ct = contentType ?? CONTENT_TYPE[kind]
  await file.save(buffer, {
    metadata: {
      contentType: ct,
      cacheControl: 'public, max-age=86400',
    },
  })
  await file.makePublic()
  return publicUrl(bucket.name, path)
}

export function publicCatalogMediaPath(
  itemId: string,
  kind: PublicCatalogMediaKind,
  ext?: string,
): string {
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return `public-catalog/${itemId}/${kind}-${unique}.${ext ?? EXT[kind]}`
}

export function publicUrl(bucketName: string, path: string): string {
  return `https://storage.googleapis.com/${bucketName}/${path}`
}

export async function createPublicCatalogUploadUrl(
  itemId: string,
  kind: PublicCatalogMediaKind,
  contentType?: string,
): Promise<{ uploadUrl: string; publicUrl: string; path: string }> {
  const bucket = adminStorage().bucket()
  const path = publicCatalogMediaPath(itemId, kind)
  const file = bucket.file(path)
  const [uploadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 20 * 60 * 1000,
    contentType: contentType ?? CONTENT_TYPE[kind],
  })
  return {
    uploadUrl,
    publicUrl: publicUrl(bucket.name, path),
    path,
  }
}

export async function finalizePublicCatalogUpload(path: string): Promise<string> {
  const bucket = adminStorage().bucket()
  const file = bucket.file(path)
  await file.makePublic()
  return publicUrl(bucket.name, path)
}

export function parseBase64Upload(
  dataUrlOrBase64: string,
): { buffer: Buffer; contentType: string } {
  const match = dataUrlOrBase64.match(/^data:([^;]+);base64,(.+)$/)
  if (match) {
    return {
      contentType: match[1],
      buffer: Buffer.from(match[2], 'base64'),
    }
  }
  return {
    contentType: 'application/octet-stream',
    buffer: Buffer.from(dataUrlOrBase64, 'base64'),
  }
}
