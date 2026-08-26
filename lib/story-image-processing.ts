import sharp from 'sharp'
import {
  applyLuminanceMask,
  isSilhouetteMask,
  opaqueBounds,
  punchStudioBackdrop,
} from '../shared/image-person-matte.js'
import { splitRigFromPixels, type CharacterRig } from '../shared/character-rig.js'

/** True, wenn das PNG schon wirklich freigestellt ist (wie Gemini-App-Export). */
export async function pngHasUsefulAlpha(png: Buffer): Promise<boolean> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const pixels = new Uint8Array(data)
  const count = info.width * info.height
  let clear = 0
  for (let i = 0; i < count; i++) {
    if (pixels[i * 4 + 3]! < 24) clear++
  }
  return clear > count * 0.12
}

/** Farbbild + gleich große Maske → transparentes PNG. Nicht beschneiden (Füße!). */
export async function applyPersonMask(colorPng: Buffer, maskPng: Buffer): Promise<Buffer> {
  const color = await sharp(colorPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const mask = await sharp(maskPng)
    .resize(color.info.width, color.info.height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels = new Uint8Array(color.data)
  const maskPixels = new Uint8Array(mask.data)
  if (isSilhouetteMask(maskPixels, color.info.width, color.info.height)) {
    applyLuminanceMask(pixels, maskPixels, color.info.width, color.info.height)
  }
  punchStudioBackdrop(pixels, color.info.width, color.info.height)

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

/** Eng um die Figur schneiden — nicht ein Rechteck, in dem noch jemand anders steht. */
export async function cropToOpaqueBounds(png: Buffer, pad = 12): Promise<Buffer> {
  const color = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const pixels = new Uint8Array(color.data)
  const box = opaqueBounds(pixels, color.info.width, color.info.height)
  if (!box) return png
  const left = Math.max(0, box.minX - pad)
  const top = Math.max(0, box.minY - pad)
  const right = Math.min(color.info.width - 1, box.maxX + pad)
  const bottom = Math.min(color.info.height - 1, box.maxY + pad)
  const width = right - left + 1
  const height = bottom - top + 1
  if (width < 8 || height < 8) return png
  if (width >= color.info.width - 2 && height >= color.info.height - 2) return png
  return sharp(pixels, {
    raw: { width: color.info.width, height: color.info.height, channels: 4 },
  })
    .extract({ left, top, width, height })
    .png()
    .toBuffer()
}

/** Studio-Grau in Achseln lochen — auch bei älteren Bibliotheksbildern. */
export async function punchCutoutPng(png: Buffer): Promise<Buffer> {
  const color = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const pixels = new Uint8Array(color.data)
  punchStudioBackdrop(pixels, color.info.width, color.info.height)
  return rgbaToPng(pixels, color.info.width, color.info.height)
}

/** Ganzkörper-Freisteller → drei transparente PNGs + Gelenke (Höhe, keine KI-Maske nötig). */
export async function splitCharacterRigPng(
  cutoutPng: Buffer,
  partMaskPng?: Buffer,
): Promise<{ head: Buffer; torso: Buffer; legs: Buffer; joints: CharacterRig['joints'] }> {
  const color = await sharp(cutoutPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const pixels = new Uint8Array(color.data)
  punchStudioBackdrop(pixels, color.info.width, color.info.height)

  let maskPixels: Uint8Array | undefined
  if (partMaskPng) {
    const mask = await sharp(partMaskPng)
      .resize(color.info.width, color.info.height, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    maskPixels = new Uint8Array(mask.data)
  }

  const split = splitRigFromPixels(pixels, color.info.width, color.info.height, maskPixels)
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
