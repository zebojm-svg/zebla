/**
 * Personen-Freistellen über eine Hell/Dunkel-Maske (Silhouette), nicht über Kleidungsfarbe.
 * Weiß in der Maske = Figur (inkl. Schuhe), Schwarz = Hintergrund und echte Lücken.
 */

export type RgbaPixels = Uint8Array | Uint8ClampedArray

function lumAt(pixels: RgbaPixels, i: number): number {
  const p = i * 4
  return (pixels[p]! + pixels[p + 1]! + pixels[p + 2]!) / 3
}

function borderAverageLum(mask: RgbaPixels, width: number, height: number): number {
  let sum = 0
  let n = 0
  const add = (x: number, y: number) => {
    sum += lumAt(mask, y * width + x)
    n++
  }
  for (let x = 0; x < width; x++) {
    add(x, 0)
    add(x, height - 1)
  }
  for (let y = 1; y < height - 1; y++) {
    add(0, y)
    add(width - 1, y)
  }
  return n === 0 ? 0 : sum / n
}

/**
 * Schreibt die Masken-Helligkeit als Alpha in das Farbbild.
 * Rand hell → Maske ist invertiert (Figur schwarz).
 */
export function applyLuminanceMask(
  color: RgbaPixels,
  mask: RgbaPixels,
  width: number,
  height: number,
): void {
  const count = width * height
  const invert = borderAverageLum(mask, width, height) > 127
  for (let i = 0; i < count; i++) {
    let alpha = lumAt(mask, i)
    if (invert) alpha = 255 - alpha
    if (alpha < 28) alpha = 0
    else if (alpha > 220) alpha = 255
    color[i * 4 + 3] = Math.round(alpha)
  }
}

/** Studio-Grau/Weiss in Achseln entfernen — weisse Schuhe unten bleiben. */
export function punchStudioBackdrop(color: RgbaPixels, width: number, height: number): void {
  let minY = height
  let maxY = 0
  const count = width * height
  for (let i = 0; i < count; i++) {
    if (color[i * 4 + 3]! < 40) continue
    const y = (i / width) | 0
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (maxY <= minY) return
  const shoeLine = minY + Math.round((maxY - minY) * 0.72)

  for (let i = 0; i < count; i++) {
    const p = i * 4
    if (color[p + 3]! < 8) continue
    const r = color[p]!
    const g = color[p + 1]!
    const b = color[p + 2]!
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const avg = (r + g + b) / 3
    const y = (i / width) | 0
    const studioGray = max - min <= 24 && avg >= 158 && avg <= 226
    const paleFill = y < shoeLine && max - min <= 28 && avg >= 175 && avg <= 248
    if (studioGray || paleFill) {
      color[p + 3] = 0
    }
  }
}
