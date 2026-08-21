/**
 * Freistellen: nur vom Bildrand zusammenhängendes Hell/Weiß entfernen.
 * Augenweiß, Zähne und helle Kleidung innen bleiben.
 */

export type RgbaPixels = Uint8Array | Uint8ClampedArray

function isBackgroundRgb(r: number, g: number, b: number, a: number): boolean {
  if (a < 24) return true
  if (r > 235 && g > 235 && b > 235) return true
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const saturation = max === 0 ? 0 : (max - min) / max
  const lum = (r + g + b) / 3
  return lum > 222 && saturation < 0.12
}

function isPaleFringe(r: number, g: number, b: number, a: number): boolean {
  if (a < 24) return false
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const saturation = max === 0 ? 0 : (max - min) / max
  const lum = (r + g + b) / 3
  return lum > 205 && saturation < 0.18
}

/**
 * Macht nur Pixel transparent, die vom Rand aus als Hintergrund erreichbar sind.
 */
export function keyOutConnectedBackground(pixels: RgbaPixels, width: number, height: number): void {
  if (width <= 0 || height <= 0) return
  const count = width * height
  const bg = new Uint8Array(count)
  const queue = new Uint32Array(count)
  let qHead = 0
  let qTail = 0

  const tryEnqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const i = y * width + x
    if (bg[i]) return
    const p = i * 4
    if (!isBackgroundRgb(pixels[p]!, pixels[p + 1]!, pixels[p + 2]!, pixels[p + 3]!)) return
    bg[i] = 1
    queue[qTail++] = i
  }

  for (let x = 0; x < width; x++) {
    tryEnqueue(x, 0)
    tryEnqueue(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    tryEnqueue(0, y)
    tryEnqueue(width - 1, y)
  }

  while (qHead < qTail) {
    const i = queue[qHead++]!
    const x = i % width
    const y = (i / width) | 0
    tryEnqueue(x - 1, y)
    tryEnqueue(x + 1, y)
    tryEnqueue(x, y - 1)
    tryEnqueue(x, y + 1)
  }

  for (let i = 0; i < count; i++) {
    if (bg[i]) pixels[i * 4 + 3] = 0
  }

  // Heller Anti-Alias-Saum am Schnitt, nicht innen (Augen).
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (bg[i]) continue
      const p = i * 4
      const r = pixels[p]!
      const g = pixels[p + 1]!
      const b = pixels[p + 2]!
      const a = pixels[p + 3]!
      if (!isPaleFringe(r, g, b, a)) continue
      const touchesBg =
        (x > 0 && bg[i - 1]) ||
        (x + 1 < width && bg[i + 1]) ||
        (y > 0 && bg[i - width]) ||
        (y + 1 < height && bg[i + width])
      if (!touchesBg) continue
      const lum = (r + g + b) / 3
      pixels[p + 3] = Math.round(Math.max(0, ((255 - lum) / 50) * a))
    }
  }
}
