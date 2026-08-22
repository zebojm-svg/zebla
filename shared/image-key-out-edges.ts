/**
 * Freistellen: Magenta-Key (neue Bilder) plus reines Weiß vom Rand (alte Bilder).
 * Lücken zwischen Armen/Körper und Fingern werden mitgelöscht.
 * Helle Schuhe, Augenweiß und Zähne bleiben.
 */

export type RgbaPixels = Uint8Array | Uint8ClampedArray

/** Chromakey — nicht Weiß (Schuhe) und nicht Grün (Juliens Hoodie). */
export const CUTOUT_KEY_HEX = '#FF00E5'
export const CUTOUT_KEY_RGB = { r: 255, g: 0, b: 229 } as const

function isChromaMagenta(r: number, g: number, b: number): boolean {
  const magentaScore = r - g + (b - g)
  return r >= 160 && g <= 110 && b >= 90 && magentaScore >= 180 && r >= g + 60
}

function isStrictWhite(r: number, g: number, b: number): boolean {
  return r >= 248 && g >= 248 && b >= 248
}

function isTransparent(a: number): boolean {
  return a < 24
}

function isKeyableBackground(r: number, g: number, b: number, a: number): boolean {
  if (isTransparent(a)) return true
  return isChromaMagenta(r, g, b) || isStrictWhite(r, g, b)
}

function isMagentaFringe(r: number, g: number, b: number, a: number): boolean {
  if (a < 24) return false
  return r >= 140 && g <= 140 && b >= 80 && r - g >= 40 && b - g >= 20
}

function isWhiteFringe(r: number, g: number, b: number, a: number): boolean {
  return a >= 24 && r >= 242 && g >= 242 && b >= 242
}

function pixelAt(pixels: RgbaPixels, i: number) {
  const p = i * 4
  return {
    r: pixels[p]!,
    g: pixels[p + 1]!,
    b: pixels[p + 2]!,
    a: pixels[p + 3]!,
  }
}

function foregroundBBox(
  bg: Uint8Array,
  pixels: RgbaPixels,
  width: number,
  height: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (bg[i]) continue
      const { r, g, b, a } = pixelAt(pixels, i)
      if (isTransparent(a) || isChromaMagenta(r, g, b) || isStrictWhite(r, g, b)) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { minX, minY, maxX, maxY }
}

function punchEnclosedWhiteHoles(
  pixels: RgbaPixels,
  bg: Uint8Array,
  width: number,
  height: number,
): void {
  const count = width * height
  const box = foregroundBBox(bg, pixels, width, height)
  if (!box) return

  const fgH = box.maxY - box.minY + 1
  const faceY2 = box.minY + fgH * 0.34
  const shoeY1 = box.minY + fgH * 0.82
  const seen = new Uint8Array(count)
  const stack = new Uint32Array(count)

  for (let start = 0; start < count; start++) {
    if (bg[start] || seen[start]) continue
    const { r, g, b, a } = pixelAt(pixels, start)
    if (!isTransparent(a) && !isStrictWhite(r, g, b)) continue

    let qLen = 0
    stack[qLen++] = start
    seen[start] = 1
    let sumY = 0
    const members: number[] = []

    while (qLen > 0) {
      const i = stack[--qLen]!
      members.push(i)
      sumY += (i / width) | 0
      const x = i % width
      const y = (i / width) | 0
      const neigh = [i - 1, i + 1, i - width, i + width]
      const nx = [x - 1, x + 1, x, x]
      const ny = [y, y, y - 1, y + 1]
      for (let n = 0; n < 4; n++) {
        const xx = nx[n]!
        const yy = ny[n]!
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
        const j = neigh[n]!
        if (bg[j] || seen[j]) continue
        const pix = pixelAt(pixels, j)
        if (!isTransparent(pix.a) && !isStrictWhite(pix.r, pix.g, pix.b)) continue
        seen[j] = 1
        stack[qLen++] = j
      }
    }

    const cy = sumY / members.length
    const inFace = cy < faceY2
    const inShoe = cy >= shoeY1
    if (inFace || inShoe) continue
    for (const i of members) bg[i] = 1
  }
}

/**
 * Macht Hintergrund transparent: Magenta überall (auch Löcher),
 * reines Weiß nur vom Rand und in geschlossenen Lücken — nicht im Gesicht, nicht in kleinen Schuh-Löchern.
 */
export function keyOutConnectedBackground(pixels: RgbaPixels, width: number, height: number): void {
  if (width <= 0 || height <= 0) return
  const count = width * height
  const bg = new Uint8Array(count)
  const queue = new Uint32Array(count)
  let qHead = 0
  let qTail = 0
  const shoeBandY = Math.floor(height * 0.88)

  const tryEnqueue = (x: number, y: number, fromBottomBand: boolean) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const i = y * width + x
    if (bg[i]) return
    const { r, g, b, a } = pixelAt(pixels, i)
    if (!isKeyableBackground(r, g, b, a)) return
    const magentaOrClear = isTransparent(a) || isChromaMagenta(r, g, b)
    // Helle Schuhe liegen oft unten: reines Weiß dort nicht vom Rand her auffressen.
    if (!magentaOrClear && y >= shoeBandY && fromBottomBand) return
    bg[i] = 1
    queue[qTail++] = i
  }

  for (let x = 0; x < width; x++) {
    tryEnqueue(x, 0, false)
  }
  for (let y = 0; y < height; y++) {
    tryEnqueue(0, y, y >= shoeBandY)
    tryEnqueue(width - 1, y, y >= shoeBandY)
  }
  // Untere Kante nur für Magenta/Alpha — nicht für Weiß (Schuhe).
  for (let x = 0; x < width; x++) {
    const i = (height - 1) * width + x
    const { r, g, b, a } = pixelAt(pixels, i)
    if (isTransparent(a) || isChromaMagenta(r, g, b)) tryEnqueue(x, height - 1, true)
  }

  while (qHead < qTail) {
    const i = queue[qHead++]!
    const x = i % width
    const y = (i / width) | 0
    const fromBottomBand = y >= shoeBandY
    tryEnqueue(x - 1, y, fromBottomBand)
    tryEnqueue(x + 1, y, fromBottomBand)
    tryEnqueue(x, y - 1, fromBottomBand)
    tryEnqueue(x, y + 1, true)
  }

  // Magenta-Löcher (Armbeuge, Fingerzwischenräume) — unabhängig vom Rand.
  for (let i = 0; i < count; i++) {
    if (bg[i]) continue
    const { r, g, b, a } = pixelAt(pixels, i)
    if (isTransparent(a) || isChromaMagenta(r, g, b)) bg[i] = 1
  }

  punchEnclosedWhiteHoles(pixels, bg, width, height)

  // Weißer Randstreifen unten (unter den Sohlen), ohne in die Schuhe zu laufen.
  const border = 8
  for (let y = shoeBandY; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (bg[i]) continue
      if (x >= border && x < width - border && y < height - border) continue
      const { r, g, b, a } = pixelAt(pixels, i)
      if (isTransparent(a) || isStrictWhite(r, g, b) || isChromaMagenta(r, g, b)) bg[i] = 1
    }
  }

  for (let i = 0; i < count; i++) {
    if (bg[i]) pixels[i * 4 + 3] = 0
  }

  // Saum nur an Magenta oder reinem Weiß — nicht an cremefarbenen Schuhen.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (bg[i]) continue
      const { r, g, b, a } = pixelAt(pixels, i)
      const fringe = isMagentaFringe(r, g, b, a) || isWhiteFringe(r, g, b, a)
      if (!fringe) continue
      const touchesBg =
        (x > 0 && bg[i - 1]) ||
        (x + 1 < width && bg[i + 1]) ||
        (y > 0 && bg[i - width]) ||
        (y + 1 < height && bg[i + width])
      if (!touchesBg) continue
      if (isMagentaFringe(r, g, b, a) && !isWhiteFringe(r, g, b, a)) {
        const dist = Math.min(r, 255 - g, b) / 255
        pixels[i * 4 + 3] = Math.round(a * Math.max(0, 1 - dist * 1.2))
        continue
      }
      const lum = (r + g + b) / 3
      pixels[i * 4 + 3] = Math.round(Math.max(0, ((255 - lum) / 18) * a))
    }
  }
}
