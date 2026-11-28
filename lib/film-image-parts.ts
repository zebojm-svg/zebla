import sharp from 'sharp'
import { NEAR_COPY_H, NEAR_COPY_W } from '../shared/film-regie-judge.js'

export type InlinePart = { mimeType: string; data: string }

export async function fetchImageBuffer(url: string, timeoutMs = 10_000): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length < 32) return null
    return { buffer, mimeType: (res.headers.get('content-type') || 'image/png').split(';')[0] || 'image/png' }
  } catch {
    return null
  }
}

/** Kleiner und billiger für die Regie: höchstens maxWidth Pixel breit, als JPEG. Misslingt das Verkleinern, geht das Original. */
export async function shrinkPart(buffer: Buffer, mimeType: string, maxWidth?: number): Promise<InlinePart> {
  if (!maxWidth) return { mimeType, data: buffer.toString('base64') }
  try {
    const small = await sharp(buffer)
      .resize({ width: maxWidth, height: maxWidth, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()
    return { mimeType: 'image/jpeg', data: small.toString('base64') }
  } catch {
    return { mimeType, data: buffer.toString('base64') }
  }
}

export async function imagePartFromUrl(
  url: string,
  opts: { timeoutMs?: number; maxWidth?: number } = {},
): Promise<InlinePart | null> {
  const got = await fetchImageBuffer(url, opts.timeoutMs)
  if (!got) return null
  return shrinkPart(got.buffer, got.mimeType, opts.maxWidth)
}

/** Kleines Graustufen-Bild für den Bildvergleich (nearCopy). */
export async function grayThumb(buffer: Buffer): Promise<Uint8Array | null> {
  try {
    const raw = await sharp(buffer).resize(NEAR_COPY_W, NEAR_COPY_H, { fit: 'fill' }).grayscale().raw().toBuffer()
    return raw.length === NEAR_COPY_W * NEAR_COPY_H ? new Uint8Array(raw) : null
  } catch {
    return null
  }
}
