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
