import sharp from 'sharp'
import { closeupCropBox } from '../shared/film-closeup-space.js'

/** Zoom-Ausschnitt der Übersicht um die sprechende Person. */
export async function cropWideStillToSpeaker(
  image: Buffer,
  speakerX = 50,
  sitting = true,
): Promise<Buffer> {
  const meta = await sharp(image).metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  if (w < 64 || h < 64) return image
  const box = closeupCropBox(w, h, speakerX, sitting)
  if (box.width >= w && box.height >= h) return image
  return sharp(image).extract(box).png().toBuffer()
}

const THUMB_W = 64
const THUMB_H = 36

async function rgbThumb(image: Buffer): Promise<Buffer> {
  return sharp(image)
    .resize(THUMB_W, THUMB_H, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer()
}

/** 0 = identisch, ~255 = total anders. Niedrig = gemaltes Bild ist der Pixel-Ausschnitt. */
export async function closeupCropDistance(painted: Buffer, cropFromWide: Buffer): Promise<number> {
  const a = await rgbThumb(painted)
  const b = await rgbThumb(cropFromWide)
  const n = Math.min(a.length, b.length)
  if (n === 0) return 255
  let sum = 0
  for (let i = 0; i < n; i++) sum += Math.abs(a[i]! - b[i]!)
  return sum / n
}

/** Gemini hat faktisch den Zuschnitt kopiert, keine neue Kameraposition. */
export async function closeupLooksLikeWideCrop(
  painted: Buffer,
  cropFromWide: Buffer,
): Promise<boolean> {
  return (await closeupCropDistance(painted, cropFromWide)) < 16
}
