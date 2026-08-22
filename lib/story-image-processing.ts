import sharp from 'sharp'
import { applyLuminanceMask } from '../shared/image-person-matte.js'

/** Farbbild + gleich große Maske → transparentes PNG. Nicht beschneiden (Füße!). */
export async function applyPersonMask(colorPng: Buffer, maskPng: Buffer): Promise<Buffer> {
  const color = await sharp(colorPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const mask = await sharp(maskPng)
    .resize(color.info.width, color.info.height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels = new Uint8Array(color.data)
  applyLuminanceMask(pixels, new Uint8Array(mask.data), color.info.width, color.info.height)

  return sharp(pixels, {
    raw: { width: color.info.width, height: color.info.height, channels: 4 },
  })
    .png()
    .toBuffer()
}
