import sharp from 'sharp'
import { keyOutConnectedBackground } from '../shared/image-key-out-edges.js'

/** Server-seitiges Freistellen: nur Rand-Hintergrund → transparentes PNG */
export async function removeLightBackground(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  const pixels = new Uint8Array(data)
  keyOutConnectedBackground(pixels, info.width, info.height)

  return sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .trim({ threshold: 10 })
    .toBuffer()
}
