import sharp from 'sharp'

/** Server-seitiges Freistellen: weißer/heller Hintergrund → transparentes PNG */
export async function removeLightBackground(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  const pixels = new Uint8Array(data)
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]!
    const g = pixels[i + 1]!
    const b = pixels[i + 2]!
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const saturation = max === 0 ? 0 : (max - min) / max

    if (r > 235 && g > 235 && b > 235) {
      pixels[i + 3] = 0
    } else if (r > 205 && g > 205 && b > 205 && saturation < 0.18) {
      const lum = (r + g + b) / 3
      pixels[i + 3] = Math.min(
        pixels[i + 3]!,
        Math.round(Math.max(0, ((255 - lum) / 50) * pixels[i + 3]!)),
      )
    }
  }

  return sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .trim({ threshold: 10 })
    .toBuffer()
}
