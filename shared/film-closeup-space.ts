/**
 * Nahaufnahme = Kamera näher an dieselbe Stelle im Weit-Bild.
 * Links/Mitte/Rechts sagen der KI, wen sie näher filmen soll — kein Pixel-Ausschnitt.
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
    `The first attached photo is the WIDE GROUNDBILD of that occupied gathering. ` +
    `Move in so the frame is tight on this person: you no longer see the whole sofa and far wall. ` +
    `The others stay at the table (cut by the frame if needed). Do not empty the room. ` +
    `Do not paste a giant head over the group photo. Same clothes. Camera push-in, not a new portrait.`
  )
}

/** FLUX Kontext: Kamera wirklich versetzen, nicht nur den Kopf zur Linse drehen. */
export function closeupKontextPrompt(opts: {
  speaker: string
  speakerX?: number
  settingHint?: string
}): string {
  const who = opts.speaker.trim() || 'the speaker'
  const side = opts.speakerX != null ? seatSideFromX(opts.speakerX) : undefined
  const from =
    side === 'right'
      ? 'the LEFT side of the gathering, across the table'
      : side === 'left'
        ? 'the RIGHT side of the gathering, across the table'
        : 'a new place beside the table, a few steps closer'
  const place = opts.settingHint?.trim() || 'the same room'
  return (
    `Keep the same watercolor comic illustration, the same people, faces and clothes. ` +
    `MOVE THE CAMERA to ${from} in ${place}. Film ${who} so we look almost straight at their face. ` +
    `Over-the-shoulder of a neighbour is good. Head and shoulders of ${who} fill most of the 16:9 frame. ` +
    `Background is what sits BEHIND them from this new camera (wall, chair, plant) — invent that side if needed. ` +
    `Do NOT keep the original wide camera. Do NOT only turn their head toward the lens. ` +
    `Do NOT paste a giant face onto the group photo. Same gathering, new viewpoint.`
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
