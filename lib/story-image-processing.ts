import sharp from 'sharp'
import { applyLuminanceMask } from '../shared/image-person-matte.js'
import { splitRigFromPixels, type CharacterRig } from '../shared/character-rig.js'

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

function rgbaToPng(pixels: Uint8Array, width: number, height: number): Promise<Buffer> {
  return sharp(pixels, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer()
}

/** Farbbild + RGB-Teile-Maske → drei transparente PNGs + Gelenke. */
export async function splitCharacterRigPng(
  cutoutPng: Buffer,
  partMaskPng: Buffer,
): Promise<{ head: Buffer; torso: Buffer; legs: Buffer; joints: CharacterRig['joints'] }> {
  const color = await sharp(cutoutPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const mask = await sharp(partMaskPng)
    .resize(color.info.width, color.info.height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const split = splitRigFromPixels(
    new Uint8Array(color.data),
    new Uint8Array(mask.data),
    color.info.width,
    color.info.height,
  )
  if (!split.ok) {
    throw new Error(split.reason)
  }

  const [head, torso, legs] = await Promise.all([
    rgbaToPng(split.head, color.info.width, color.info.height),
    rgbaToPng(split.torso, color.info.width, color.info.height),
    rgbaToPng(split.legs, color.info.width, color.info.height),
  ])
  return { head, torso, legs, joints: split.joints }
}
