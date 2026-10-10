/**
 * Raum + Figuren einzeln, dann als ein Standbild übereinanderlegen.
 */

import { randomUUID } from 'crypto'
import sharp from 'sharp'
import {
  ARRANGE_CANVAS,
  arrangeLayersFromPanel,
  panelCanArrange,
} from '../shared/film-still-arrange.js'
import type { FilmStoryboardPanel } from '../shared/film-storyboard.js'

async function fetchPng(url: string): Promise<Buffer> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 16_000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error('Bild nicht geladen.')
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 32) throw new Error('Bild leer.')
    return buf
  } finally {
    clearTimeout(timer)
  }
}

async function uploadPng(buffer: Buffer, path: string): Promise<string> {
  const { adminStorage } = await import('./firebase-admin.js')
  const bucket = adminStorage().bucket()
  const file = bucket.file(path)
  await file.save(buffer, {
    metadata: { contentType: 'image/png', cacheControl: 'public, max-age=86400' },
  })
  await file.makePublic()
  return `https://storage.googleapis.com/${bucket.name}/${path}`
}

export async function compositePanelStillPng(panel: FilmStoryboardPanel): Promise<Buffer> {
  if (!panelCanArrange(panel)) throw new Error('Raum oder Figuren fehlen zum Legen.')
  const { width, height } = ARRANGE_CANVAS
  const layers = arrangeLayersFromPanel(panel, width, height)
  const bg = layers.find((l) => l.id === 'bg')
  if (!bg) throw new Error('Kein Raum.')
  const bgBuf = await fetchPng(bg.src)
  const overlays: sharp.OverlayOptions[] = []

  for (const layer of layers.filter((l) => l.id !== 'bg').sort((a, b) => a.zIndex - b.zIndex)) {
    const raw = await fetchPng(layer.src)
    const w = Math.max(8, Math.round(layer.width))
    const h = Math.max(8, Math.round(layer.height))
    let img = sharp(raw).resize(w, h, { fit: 'fill' }).ensureAlpha()
    if (layer.flip) img = img.flop()
    const prepared = await img.png().toBuffer()
    const left = Math.round(layer.x)
    const top = Math.round(layer.y)
    if (left + w < 0 || top + h < 0 || left >= width || top >= height) continue
    overlays.push({
      input: prepared,
      left: Math.max(0, left),
      top: Math.max(0, top),
    })
  }

  return sharp(bgBuf)
    .resize(width, height, { fit: 'cover' })
    .ensureAlpha()
    .composite(overlays)
    .png()
    .toBuffer()
}

export async function uploadComposedStill(panel: FilmStoryboardPanel): Promise<string> {
  const png = await compositePanelStillPng(panel)
  return uploadPng(png, `film-stills/${randomUUID()}.png`)
}
