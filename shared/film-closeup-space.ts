/**
 * Nahaufnahme = Kamera näher an dieselbe Stelle im Weit-Bild.
 * Links/Mitte/Rechts und der Zuschnitt sagen der KI, was hinter der Person steht.
 */

export type SeatSide = 'left' | 'center' | 'right'

export function seatSideFromX(x: number): SeatSide {
  if (x < 38) return 'left'
  if (x > 62) return 'right'
  return 'center'
}

export function closeupSpaceLine(opts: {
  speaker: string
  settingHint?: string
  speakerX?: number
  poseHint?: string
}): string {
  const speaker = opts.speaker.trim() || 'the speaker'
  const side = opts.speakerX != null ? seatSideFromX(opts.speakerX) : undefined
  const sitting = /sit/i.test(opts.poseHint || '')
  const place = sitting ? 'sitting at the table' : 'in this gathering'
  const where = side ? `${place} on the ${side} of the frame` : place
  const room = opts.settingHint?.trim() || 'the same room as the wide photo'
  return (
    `3D ROOM: ${speaker} is ${where} in ${room}. ` +
    `The first attached photo is a camera zoom of that gathering. ` +
    `Keep the exact furniture BEHIND this person in that photo (table edge, chairs, kitchen, window). ` +
    `Do not invent a different wall or studio. Camera push-in, not a new portrait.`
  )
}

/** 16:9-Fenster um die Person herum — Zoom in die Übersicht. */
export function closeupCropBox(
  imageW: number,
  imageH: number,
  speakerX = 50,
  sitting = true,
): { left: number; top: number; width: number; height: number } {
  const cropW = Math.max(64, Math.round(imageW * 0.46))
  const cropH = Math.max(36, Math.round(cropW * (9 / 16)))
  const width = Math.min(cropW, imageW)
  const height = Math.min(cropH, imageH)
  const cx = (Math.min(96, Math.max(4, speakerX)) / 100) * imageW
  const left = Math.max(0, Math.min(imageW - width, Math.round(cx - width / 2)))
  const faceY = sitting ? 0.4 : 0.32
  const top = Math.max(0, Math.min(imageH - height, Math.round(imageH * faceY - height * 0.45)))
  return { left, top, width, height }
}
