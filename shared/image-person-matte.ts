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

function isStudioCandidate(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const avg = (r + g + b) / 3
  return max - min <= 30 && avg >= 148 && avg <= 245
}

function hasClearNeighbor(
  alpha: Uint8Array,
  width: number,
  height: number,
  i: number,
): boolean {
  const x = i % width
  const y = (i / width) | 0
  if (x > 0 && alpha[i - 1]! < 8) return true
  if (x + 1 < width && alpha[i + 1]! < 8) return true
  if (y > 0 && alpha[i - width]! < 8) return true
  if (y + 1 < height && alpha[i + width]! < 8) return true
  return false
}

/**
 * Studio-Grau/Weiss in Achseln und Lücken entfernen.
 * Weisse Schuhe unten bleiben: grosse helle Flächen unter ~72 % der Figur
 * (Sneaker) werden nicht gelöscht, nur ein dünner Rand zur Transparenz.
 */
export function punchStudioBackdrop(color: RgbaPixels, width: number, height: number): void {
  const count = width * height
  let minY = height
  let maxY = 0
  let personN = 0
  for (let i = 0; i < count; i++) {
    if (color[i * 4 + 3]! < 40) continue
    personN++
    const y = (i / width) | 0
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (maxY <= minY || personN < 80) return
  const shoeLine = minY + Math.round((maxY - minY) * 0.72)

  const isCandidate = (i: number): boolean => {
    const p = i * 4
    if (color[p + 3]! < 8) return false
    return isStudioCandidate(color[p]!, color[p + 1]!, color[p + 2]!)
  }

  const alphaSnap = new Uint8Array(count)
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < count; i++) alphaSnap[i] = color[i * 4 + 3]!
    for (let i = 0; i < count; i++) {
      if (!isCandidate(i)) continue
      const y = (i / width) | 0
      if (y >= shoeLine && pass > 0) continue
      if (hasClearNeighbor(alphaSnap, width, height, i)) {
        color[i * 4 + 3] = 0
      }
    }
  }

  const seen = new Uint8Array(count)
  const queue = new Int32Array(count)
  const members = new Int32Array(count)
  const smallLimit = Math.max(60, Math.round(personN * 0.1))

  for (let start = 0; start < count; start++) {
    if (!isCandidate(start) || seen[start]) continue
    let qh = 0
    let qt = 0
    let n = 0
    let cMaxY = 0
    queue[qt++] = start
    seen[start] = 1
    while (qh < qt) {
      const i = queue[qh++]!
      members[n++] = i
      const x = i % width
      const y = (i / width) | 0
      if (y > cMaxY) cMaxY = y
      if (x > 0) {
        const ni = i - 1
        if (isCandidate(ni) && !seen[ni]) {
          seen[ni] = 1
          queue[qt++] = ni
        }
      }
      if (x + 1 < width) {
        const ni = i + 1
        if (isCandidate(ni) && !seen[ni]) {
          seen[ni] = 1
          queue[qt++] = ni
        }
      }
      if (y > 0) {
        const ni = i - width
        if (isCandidate(ni) && !seen[ni]) {
          seen[ni] = 1
          queue[qt++] = ni
        }
      }
      if (y + 1 < height) {
        const ni = i + width
        if (isCandidate(ni) && !seen[ni]) {
          seen[ni] = 1
          queue[qt++] = ni
        }
      }
    }
    if (n > smallLimit || cMaxY >= shoeLine) continue
    for (let k = 0; k < n; k++) {
      color[members[k]! * 4 + 3] = 0
    }
  }
}
