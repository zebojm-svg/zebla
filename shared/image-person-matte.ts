/**
 * Personen-Freistellen über eine Hell/Dunkel-Maske (Silhouette), nicht über Kleidungsfarbe.
 * Weiß in der Maske = Figur (inkl. helle Kleidung und Schuhe), Schwarz = Hintergrund.
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
 * Echte Schablone: fast nur Schwarz/Weiss, kaum Farbe.
 * Ein Foto als «Maske» würde weisse Hoodies und Gesichter löschen — das verwerfen wir.
 */
export function isSilhouetteMask(mask: RgbaPixels, width: number, height: number): boolean {
  const count = width * height
  if (count < 16) return false
  const step = Math.max(1, Math.floor(count / 12_000))
  let n = 0
  let chroma = 0
  let mid = 0
  for (let i = 0; i < count; i += step) {
    n++
    const p = i * 4
    const r = mask[p]!
    const g = mask[p + 1]!
    const b = mask[p + 2]!
    if (Math.max(r, g, b) - Math.min(r, g, b) > 28) chroma++
    const lum = (r + g + b) / 3
    if (lum > 48 && lum < 208) mid++
  }
  if (n === 0) return false
  if (chroma / n > 0.1) return false
  if (mid / n > 0.55) return false
  return true
}

/**
 * Schreibt die Masken-Helligkeit als Alpha in das Farbbild.
 * Rand hell → Maske ist invertiert (Figur schwarz).
 * Kein weiches Grau: sonst wirkt die ganze Figur halb durchsichtig.
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
    let lum = lumAt(mask, i)
    if (invert) lum = 255 - lum
    color[i * 4 + 3] = lum >= 96 ? 255 : 0
  }
}

/** Studio #D0D0D0 — nicht weisse Kleidung (~240+) und nicht Jeans/Haut. */
function isStudioGray(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const avg = (r + g + b) / 3
  return max - min <= 12 && avg >= 196 && avg <= 218
}

/**
 * Nur Studio-Grau, das mit dem Bildrand zusammenhängt, entfernen.
 * Innenflächen (Hoodie, Achseln, Jeans-Glanz) bleiben — sonst entsteht Swiss Cheese.
 */
export function punchStudioBackdrop(color: RgbaPixels, width: number, height: number): void {
  const count = width * height
  const seen = new Uint8Array(count)
  const queue = new Int32Array(count)
  let qh = 0
  let qt = 0

  const enqueue = (i: number): void => {
    if (seen[i]) return
    seen[i] = 1
    queue[qt++] = i
  }

  const seed = (i: number): void => {
    const a = color[i * 4 + 3]!
    if (a < 8) {
      enqueue(i)
      return
    }
    if (isStudioGray(color[i * 4]!, color[i * 4 + 1]!, color[i * 4 + 2]!)) enqueue(i)
  }

  for (let x = 0; x < width; x++) {
    seed(x)
    seed((height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y++) {
    seed(y * width)
    seed(y * width + (width - 1))
  }
  if (qt === 0) return

  while (qh < qt) {
    const i = queue[qh++]!
    const p = i * 4
    const a = color[p + 3]!
    if (a >= 8 && isStudioGray(color[p]!, color[p + 1]!, color[p + 2]!)) {
      color[p + 3] = 0
    }
    const x = i % width
    const y = (i / width) | 0
    const tryN = (nx: number, ny: number): void => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return
      const ni = ny * width + nx
      if (seen[ni]) return
      const na = color[ni * 4 + 3]!
      if (na < 8) {
        enqueue(ni)
        return
      }
      if (isStudioGray(color[ni * 4]!, color[ni * 4 + 1]!, color[ni * 4 + 2]!)) enqueue(ni)
    }
    tryN(x - 1, y)
    tryN(x + 1, y)
    tryN(x, y - 1)
    tryN(x, y + 1)
  }
}

export function opaqueRatio(color: RgbaPixels, width: number, height: number, threshold = 24): number {
  const count = width * height
  if (count === 0) return 0
  let n = 0
  for (let i = 0; i < count; i++) {
    if (color[i * 4 + 3]! >= threshold) n++
  }
  return n / count
}

export function opaqueBounds(
  color: RgbaPixels,
  width: number,
  height: number,
  threshold = 24,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (color[(y * width + x) * 4 + 3]! < threshold) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { minX, minY, maxX, maxY }
}

export function binaryAlphaMask(
  color: RgbaPixels,
  width: number,
  height: number,
  threshold = 96,
): Uint8Array {
  const count = width * height
  const out = new Uint8Array(count)
  for (let i = 0; i < count; i++) {
    out[i] = color[i * 4 + 3]! >= threshold ? 1 : 0
  }
  return out
}

export function maskIoU(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length)
  let inter = 0
  let union = 0
  for (let i = 0; i < n; i++) {
    const av = a[i]!
    const bv = b[i]!
    if (av || bv) union++
    if (av && bv) inter++
  }
  return union === 0 ? 0 : inter / union
}
