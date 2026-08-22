/**
 * Figuren-Skelett, erster Schritt: drei zusammenhängende Teile
 * (Beine — Rumpf/Arme — Kopf), verbunden am Hüft- und Halsgelenk.
 * Die Teile liegen im gleichen Bildformat; der Kopf kann am Hals gedreht
 * oder durch einen anderen Kopf derselben Figur ersetzt werden.
 */

export type RigPartId = 'head' | 'torso' | 'legs'

export type RigJoint = { x: number; y: number }

export interface CharacterRig {
  parts: { head: string; torso: string; legs: string }
  joints: { neck: RigJoint; hip: RigJoint }
  /** Halsgelenk des Kopf-Bildes, falls der Kopf aus einer anderen Pose kommt */
  headSourceJoints?: { neck: RigJoint; hip: RigJoint }
}

export const DEFAULT_RIG_JOINTS = {
  neck: { x: 0.5, y: 0.22 },
  hip: { x: 0.5, y: 0.52 },
} as const

export const HEAD_TWIST_MIN = -35
export const HEAD_TWIST_MAX = 35

export function isCharacterRig(value: unknown): value is CharacterRig {
  if (!value || typeof value !== 'object') return false
  const v = value as CharacterRig
  return Boolean(
    v.parts?.head &&
      v.parts?.torso &&
      v.parts?.legs &&
      Number.isFinite(v.joints?.neck?.x) &&
      Number.isFinite(v.joints?.neck?.y) &&
      Number.isFinite(v.joints?.hip?.x) &&
      Number.isFinite(v.joints?.hip?.y),
  )
}

export function clampHeadTwist(deg: number): number {
  if (!Number.isFinite(deg)) return 0
  return Math.max(HEAD_TWIST_MIN, Math.min(HEAD_TWIST_MAX, deg))
}

/**
 * Rot/Grün/Blau-Maske: Rot = Kopf, Grün = Rumpf+Arme, Blau = Beine.
 * Nur Hinweis in den Gelenk-Streifen — die Höhe der Figur entscheidet.
 */
export function classifyPartPixel(r: number, g: number, b: number): RigPartId | null {
  const max = Math.max(r, g, b)
  if (max < 48) return null
  const min = Math.min(r, g, b)
  if (max - min < 28) return null
  if (r >= g && r >= b) return 'head'
  if (g >= r && g >= b) return 'torso'
  return 'legs'
}

export type SplitRigPixels = {
  ok: true
  head: Uint8Array
  torso: Uint8Array
  legs: Uint8Array
  joints: { neck: RigJoint; hip: RigJoint }
  coverage: { head: number; torso: number; legs: number }
}

export type SplitRigFail = { ok: false; reason: string }

function emptyRgba(count: number): Uint8Array {
  return new Uint8Array(count * 4)
}

function copyPixel(dst: Uint8Array, src: Uint8Array, i: number, alpha: number): void {
  const p = i * 4
  dst[p] = src[p]!
  dst[p + 1] = src[p + 1]!
  dst[p + 2] = src[p + 2]!
  dst[p + 3] = alpha
}

function dilatePart(part: Uint8Array, color: Uint8Array, width: number, height: number, radius: number): void {
  const count = width * height
  for (let pass = 0; pass < radius; pass++) {
    const snapshot = new Uint8Array(part)
    for (let i = 0; i < count; i++) {
      if (snapshot[i * 4 + 3]! > 0) continue
      const x = i % width
      const y = (i / width) | 0
      let found = -1
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1) && found < 0; ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
          const ni = ny * width + nx
          if (snapshot[ni * 4 + 3]! > 40) {
            found = ni
            break
          }
        }
      }
      if (found >= 0) copyPixel(part, color, i, Math.min(220, snapshot[found * 4 + 3]!))
    }
  }
}

function bboxFromAlpha(
  pixels: Uint8Array,
  width: number,
  height: number,
): { minX: number; minY: number; maxX: number; maxY: number; n: number } | null {
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  let n = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3]! < 40) continue
      n++
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (n < 80) return null
  return { minX, minY, maxX, maxY, n }
}

/**
 * Figur in Kopf / Rumpf / Beine schneiden.
 * Quelle der Wahrheit ist die Körperhöhe (oben Kopf, unten Beine).
 * Eine optionale RGB-Maske darf nur in schmalen Gelenk-Streifen mitreden —
 * sonst landet eine durchgängig rote KI-Maske auf den Füssen und Zerlegen bricht ab.
 */
export function splitRigFromPixels(
  color: Uint8Array,
  width: number,
  height: number,
  mask?: Uint8Array | null,
): SplitRigPixels | SplitRigFail {
  const count = width * height
  if (color.length < count * 4) {
    return { ok: false, reason: 'Bilddaten unvollständig.' }
  }
  if (mask && mask.length < count * 4) {
    return { ok: false, reason: 'Maske und Bild passen nicht zusammen.' }
  }

  const person = bboxFromAlpha(color, width, height)
  if (!person) {
    return { ok: false, reason: 'Keine Figur im Bild — bitte ein Ganzkörperbild nehmen.' }
  }

  const y0 = person.minY
  const bodyH = Math.max(1, person.maxY - person.minY + 1)
  const headEnd = y0 + bodyH * 0.3
  const legsStart = y0 + bodyH * 0.5
  const neckBand0 = y0 + bodyH * 0.24
  const neckBand1 = y0 + bodyH * 0.34
  const hipBand0 = y0 + bodyH * 0.46
  const hipBand1 = y0 + bodyH * 0.56

  const head = emptyRgba(count)
  const torso = emptyRgba(count)
  const legs = emptyRgba(count)
  const coverage = { head: 0, torso: 0, legs: 0 }

  for (let i = 0; i < count; i++) {
    const a = color[i * 4 + 3]!
    if (a < 24) continue
    const y = (i / width) | 0
    let part: RigPartId = y < headEnd ? 'head' : y >= legsStart ? 'legs' : 'torso'

    if (mask) {
      const p = i * 4
      const hinted = classifyPartPixel(mask[p]!, mask[p + 1]!, mask[p + 2]!)
      if (hinted === 'head' || hinted === 'torso') {
        if (y >= neckBand0 && y < neckBand1) part = hinted
      }
      if (hinted === 'torso' || hinted === 'legs') {
        if (y >= hipBand0 && y < hipBand1) part = hinted
      }
    }

    const dest = part === 'head' ? head : part === 'torso' ? torso : legs
    copyPixel(dest, color, i, a)
    coverage[part]++
  }

  const minPart = Math.max(20, Math.round(person.n * 0.04))
  if (coverage.head < minPart || coverage.torso < minPart || coverage.legs < minPart) {
    return {
      ok: false,
      reason: 'Zu wenig Pixel in Kopf, Rumpf oder Beinen. Bitte eine Ganzkörperfigur nehmen.',
    }
  }

  dilatePart(head, color, width, height, 2)
  dilatePart(torso, color, width, height, 2)
  dilatePart(legs, color, width, height, 2)

  const headBox = bboxFromAlpha(head, width, height)
  const torsoBox = bboxFromAlpha(torso, width, height)
  const legsBox = bboxFromAlpha(legs, width, height)
  if (!headBox || !torsoBox || !legsBox) {
    return { ok: false, reason: 'Teile zu klein nach dem Freistellen.' }
  }

  const cx = (person.minX + person.maxX) / 2 / width
  const neck: RigJoint = {
    x: cx,
    y: (y0 + bodyH * 0.28) / height,
  }
  const hip: RigJoint = {
    x: cx,
    y: Math.max(neck.y + 0.08, (y0 + bodyH * 0.52) / height),
  }

  return { ok: true, head, torso, legs, joints: { neck, hip }, coverage }
}
