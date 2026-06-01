import type { Dialog } from '../types'

export type SpeakerSide = 'left' | 'right' | 'center'

/** Langsamer Zoom auf Nahporträt (Gesicht). */
export const PORTRAIT_KEN_BURNS_ZOOM = 0.18

/** @deprecated Two-shot crop – Porträts nutzen drawPortraitKenBurns. */
export const KEN_BURNS_ZOOM = 0.1

export const KEN_BURNS_EXPORT_FRAMES = 8

export function buildSpeakerSideMap(speakersInOrder: string[]): Map<string, SpeakerSide> {
  const unique: string[] = []
  const seen = new Set<string>()
  for (const name of speakersInOrder) {
    if (!seen.has(name)) {
      seen.add(name)
      unique.push(name)
    }
  }
  const map = new Map<string, SpeakerSide>()
  if (unique[0]) map.set(unique[0], 'left')
  if (unique[1]) map.set(unique[1], 'right')
  for (let i = 2; i < unique.length; i++) {
    map.set(unique[i], i % 2 === 0 ? 'right' : 'left')
  }
  return map
}

export function collectSpeakersInOrder(dialog: Dialog): string[] {
  const order: string[] = []
  for (const section of dialog.sections) {
    for (const line of section.lines) {
      order.push(line.speaker)
    }
  }
  return order
}

export function speakerSideFor(
  map: Map<string, SpeakerSide>,
  speaker: string,
): SpeakerSide {
  return map.get(speaker) ?? 'center'
}

export function kenBurnsFocusX(side: SpeakerSide): number {
  if (side === 'left') return 0.28
  if (side === 'right') return 0.72
  return 0.5
}

export function estimateLineDurationSec(text: string, rate: number): number {
  const chars = text.replace(/\s/g, '').length || text.length
  const ms = Math.min(12000, Math.max(1500, (chars / (9 * Math.max(rate, 0.4))) * 1000))
  return ms / 1000
}

/** Zeichnet Bild mit Ken-Burns-Zoom auf den Sprecher-Fokus (Canvas). */
export function drawKenBurnsImage(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
  _side: SpeakerSide,
  progress: number,
): void {
  drawPortraitKenBurns(ctx, bitmap, destX, destY, destW, destH, progress)
}

/** Nahporträt: Zoom von Mitte/Gesicht (kein seitlicher Crop). */
export function drawPortraitKenBurns(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
  progress: number,
): void {
  const scale = 1 + Math.min(1, Math.max(0, progress)) * PORTRAIT_KEN_BURNS_ZOOM
  const focusX = 0.5
  const focusY = 0.38
  const srcW = bitmap.width / scale
  const srcH = bitmap.height / scale
  let srcX = focusX * bitmap.width - srcW / 2
  srcX = Math.max(0, Math.min(bitmap.width - srcW, srcX))
  let srcY = focusY * bitmap.height - srcH / 2
  srcY = Math.max(0, Math.min(bitmap.height - srcH, srcY))
  ctx.drawImage(bitmap, srcX, srcY, srcW, srcH, destX, destY, destW, destH)
}

export function twoShotLayoutHint(speakers: string[]): string {
  const unique = [...new Set(speakers)]
  if (unique.length >= 2) {
    return `Medium two-shot: ${unique[0]} on the LEFT third of the frame, ${unique[1]} on the RIGHT third, both facing slightly toward each other, equal prominence, full upper body visible. `
  }
  if (unique.length === 1) {
    return `Single subject ${unique[0]} centered, medium shot, upper body visible. `
  }
  return ''
}

export const PHOTOREALISTIC_STYLE =
  'Photorealistic cinematic photograph, natural soft lighting, shallow depth of field, high detail, attractive well-groomed young adults, realistic skin texture. NOT cartoon, NOT illustration, NOT anime. No text or labels in the image.'
