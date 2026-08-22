/**
 * Pixel-Check: Kleidung bleibt, Studio-Rand weg, Foto nicht als Maske.
 * Aufruf: npx tsx scripts/check-story-matte.ts
 */
import { splitRigFromPixels } from '../shared/character-rig.ts'
import {
  applyLuminanceMask,
  isSilhouetteMask,
  punchStudioBackdrop,
} from '../shared/image-person-matte.ts'

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
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) setPx(color, W, x, y, 208, 208, 208, 255)
}
for (let y = 10; y <= 109; y++) {
  for (let x = 12; x <= 35; x++) {
    if (y <= 35) setPx(color, W, x, y, 210, 168, 142, 255)
    else if (y <= 68) setPx(color, W, x, y, 242, 242, 246, 255)
    else if (y <= 98) setPx(color, W, x, y, 50, 90, 180, 255)
    else setPx(color, W, x, y, 245, 245, 250, 255)
  }
}
setPx(color, W, 18, 32, 208, 208, 208, 255)

const punched = new Uint8Array(color)
punchStudioBackdrop(punched, W, H)

if (getA(punched, W, 2, 2) !== 0) fail('Studio am Rand muss weg')
if (getA(punched, W, 20, 50) < 200) fail('Weisser Hoodie darf nicht gelöscht werden')
if (getA(punched, W, 20, 80) < 200) fail('Jeans dürfen nicht gelöscht werden')
if (getA(punched, W, 22, 104) < 200) fail('Weisse Schuhe unten müssen bleiben')
if (getA(punched, W, 20, 20) < 200) fail('Gesicht/Haut muss bleiben')

const photoMask = new Uint8Array(color)
if (isSilhouetteMask(photoMask, W, H)) fail('Ein Farbfoto darf nicht als Maske gelten')

const stencil = rgba(W, H)
for (let y = 10; y <= 109; y++) {
  for (let x = 12; x <= 35; x++) setPx(stencil, W, x, y, 255, 255, 255, 255)
}
if (!isSilhouetteMask(stencil, W, H)) fail('Schwarzweiss-Schablone muss als Maske gelten')

const cut = new Uint8Array(color)
applyLuminanceMask(cut, stencil, W, H)
if (getA(cut, W, 20, 50) < 250) fail('Schablone muss den Hoodie behalten')
if (getA(cut, W, 2, 2) !== 0) fail('Schablone muss den Studio-Rand entfernen')

const invertMask = rgba(W, H)
for (let i = 0; i < W * H; i++) {
  invertMask[i * 4] = 255
  invertMask[i * 4 + 1] = 255
  invertMask[i * 4 + 2] = 255
  invertMask[i * 4 + 3] = 255
}
for (let y = 10; y <= 109; y++) {
  for (let x = 12; x <= 35; x++) setPx(invertMask, W, x, y, 0, 0, 0, 255)
}
const inverted = new Uint8Array(color)
applyLuminanceMask(inverted, invertMask, W, H)
if (getA(inverted, W, 20, 50) < 250) fail('Invertierte Schablone muss die Figur behalten')
if (getA(inverted, W, 2, 2) !== 0) fail('Invertierte Schablone muss den Hintergrund lochen')

const redMask = rgba(W, H)
for (let y = 10; y <= 109; y++) {
  for (let x = 12; x <= 35; x++) setPx(redMask, W, x, y, 255, 0, 0, 255)
}

const splitRed = splitRigFromPixels(punched, W, H, redMask)
if (!splitRed.ok) fail(`Zerlegen mit roter Maske: ${splitRed.reason}`)
if (splitRed.coverage.head < 80 || splitRed.coverage.torso < 80 || splitRed.coverage.legs < 80) {
  fail(`Teile zu dünn: ${JSON.stringify(splitRed.coverage)}`)
}

const splitBands = splitRigFromPixels(punched, W, H)
if (!splitBands.ok) fail(`Zerlegen ohne Maske: ${splitBands.reason}`)
if (splitBands.joints.neck.y >= splitBands.joints.hip.y) fail('Hals muss über der Hüfte liegen')

console.log('OK: Kleidung bleibt, Studio-Rand weg, Foto nicht als Maske')
