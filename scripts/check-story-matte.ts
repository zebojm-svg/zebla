/**
 * Pixel-Check: Zerlegen trotz roter KI-Maske, Achseln lochen, Schuhe behalten.
 * Aufruf: npx tsx scripts/check-story-matte.ts
 */
import { splitRigFromPixels } from '../shared/character-rig.ts'
import { punchStudioBackdrop } from '../shared/image-person-matte.ts'

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

function rgba(w: number, h: number): Uint8Array {
  return new Uint8Array(w * h * 4)
}

function setPx(buf: Uint8Array, w: number, x: number, y: number, r: number, g: number, b: number, a: number): void {
  const p = (y * w + x) * 4
  buf[p] = r
  buf[p + 1] = g
  buf[p + 2] = b
  buf[p + 3] = a
}

function getA(buf: Uint8Array, w: number, x: number, y: number): number {
  return buf[(y * w + x) * 4 + 3]!
}

const W = 48
const H = 120
const color = rgba(W, H)
const redMask = rgba(W, H)

for (let y = 10; y <= 109; y++) {
  for (let x = 12; x <= 35; x++) {
    if (y <= 35) setPx(color, W, x, y, 90, 50, 30, 255)
    else if (y <= 68) setPx(color, W, x, y, 40, 180, 70, 255)
    else if (y <= 98) setPx(color, W, x, y, 50, 90, 180, 255)
    else setPx(color, W, x, y, 245, 245, 250, 255)
    setPx(redMask, W, x, y, 255, 0, 0, 255)
  }
}

for (let y = 28; y <= 36; y++) {
  for (let x = 16; x <= 22; x++) {
    setPx(color, W, x, y, 190, 190, 196, 255)
  }
}

const punched = new Uint8Array(color)
punchStudioBackdrop(punched, W, H)

if (getA(punched, W, 18, 32) !== 0) fail('Achsel-Grau sollte transparent sein')
if (getA(punched, W, 20, 50) < 200) fail('Grüner Hoodie darf nicht gelöscht werden')
if (getA(punched, W, 22, 104) < 200) fail('Weisse Schuhe unten müssen bleiben')
if (getA(punched, W, 20, 20) < 200) fail('Kopf/Haare müssen bleiben')

const splitRed = splitRigFromPixels(punched, W, H, redMask)
if (!splitRed.ok) fail(`Zerlegen mit roter Maske: ${splitRed.reason}`)
if (splitRed.coverage.head < 80 || splitRed.coverage.torso < 80 || splitRed.coverage.legs < 80) {
  fail(`Teile zu dünn: ${JSON.stringify(splitRed.coverage)}`)
}

const splitBands = splitRigFromPixels(punched, W, H)
if (!splitBands.ok) fail(`Zerlegen ohne Maske: ${splitBands.reason}`)
if (splitBands.joints.neck.y >= splitBands.joints.hip.y) fail('Hals muss über der Hüfte liegen')

const headA = splitBands.head[(22 * W + 20) * 4 + 3]!
const legsA = splitBands.legs[(22 * W + 20) * 4 + 3]!
if (headA < 20) fail('Pixel auf Kopfhöhe muss im Kopf-Teil liegen')
if (legsA > 20) fail('Kopf-Pixel darf nicht in den Beinen landen')

const footHead = splitBands.head[(104 * W + 22) * 4 + 3]!
const footLegs = splitBands.legs[(104 * W + 22) * 4 + 3]!
if (footHead > 20) fail('Schuh darf nicht im Kopf-Teil landen')
if (footLegs < 20) fail('Schuh muss in den Beinen landen')

console.log('OK: Zerlegen (auch rote Maske) + Achseln lochen, Schuhe bleiben')
