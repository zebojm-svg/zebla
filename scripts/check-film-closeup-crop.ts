/**
 * Ausschnitt vs. neue Kamera (ohne echte KI-Bilder).
 * Aufruf: npx tsx scripts/check-film-closeup-crop.ts
 */
import sharp from 'sharp'
import {
  closeupCropDistance,
  closeupLooksLikeWideCrop,
  cropWideStillToSpeaker,
} from '../lib/film-closeup-crop.ts'

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

async function solidPng(r: number, g: number, b: number, w = 320, h = 180): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer()
}

const red = await solidPng(200, 40, 40)
const redCopy = await solidPng(200, 40, 40)
const blue = await solidPng(40, 40, 200)

if (!(await closeupLooksLikeWideCrop(red, redCopy))) fail('Gleiches Bild = Ausschnitt')
if (await closeupLooksLikeWideCrop(red, blue)) fail('Rot vs Blau ist keine Kopie')
if ((await closeupCropDistance(red, redCopy)) > 1) fail('Identisch: Distanz nahe 0')
if ((await closeupCropDistance(red, blue)) < 80) fail('Andere Farbe: Distanz hoch')

const wide = await sharp({
  create: { width: 640, height: 360, channels: 3, background: { r: 30, g: 80, b: 30 } },
})
  .composite([
    {
      input: await solidPng(220, 180, 80, 120, 160),
      left: 40,
      top: 80,
    },
  ])
  .png()
  .toBuffer()
const crop = await cropWideStillToSpeaker(wide, 18, true)
if (!(await closeupLooksLikeWideCrop(crop, crop))) fail('Zuschnitt gegen sich selbst')
if (await closeupLooksLikeWideCrop(wide, crop)) {
  fail('Ganzes Weit-Bild ist nicht derselbe Zuschnitt')
}

console.log('OK: Ausschnitt-Erkennung')
