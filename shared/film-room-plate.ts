/**
 * Raumbild zuerst: jeder Ort aus dem Regiebuch bekommt einmal ein leeres Raumbild.
 * Es ist die feste Einrichtung (welche Möbel, wie viele, an welcher Wand). Maler und Regie halten sich daran.
 * Gilt für jede Geschichte; keine Regeln für bestimmte Räume.
 */

export interface FilmRoomPlate {
  /** Name des Ortes wie im Regiebuch. */
  place: string
  url: string
  assetId?: string
  /** Die Regie hat das Raumbild angeschaut. */
  checked?: boolean
  /** Ergebnis der Regie: leer und Einrichtung wie beschrieben. */
  ok?: boolean
  /** Was die Regie dazu sagt (bei Fehler oder Kleinigkeit). */
  noteDe?: string
  /** Was beim Neuzeichnen anders sein muss, englisch. */
  fixEn?: string
  /** So oft gezeichnet (nach einem Fehler der Regie höchstens einmal neu). */
  tries?: number
  model?: string
  /** Jean-Marie hat es neu zeichnen lassen oder mit einem Hinweis geändert. */
  byUser?: boolean
  /** Hinweis von Jean-Marie beim Ändern. */
  hintDe?: string
  at: string
}

/** Höchstens so oft zeichnet Zebla ein Raumbild von sich aus (erstes Bild + ein neuer Versuch nach Fehler). */
export const ROOM_PLATE_AUTO_TRIES = 2

function norm(name: string): string {
  return name.trim().toLowerCase()
}

export function roomPlateFor(plates: FilmRoomPlate[] | undefined, place: string): FilmRoomPlate | undefined {
  const want = norm(place)
  if (!want) return undefined
  return (plates ?? []).find((plate) => norm(plate.place) === want && plate.url.startsWith('http'))
}

/** Neues oder ersetztes Raumbild; ein Ort hat genau eins. */
export function withRoomPlate(plates: FilmRoomPlate[] | undefined, plate: FilmRoomPlate): FilmRoomPlate[] {
  return [...(plates ?? []).filter((have) => norm(have.place) !== norm(plate.place)), plate]
}

/** Das Raumbild braucht noch einen Blick der Regie. */
export function roomPlateNeedsCheck(plate: FilmRoomPlate | undefined): boolean {
  return Boolean(plate && !plate.checked)
}

/** Die Regie fand einen Fehler, und Zebla darf noch einmal von sich aus zeichnen. */
export function roomPlateNeedsRedraw(plate: FilmRoomPlate | undefined): boolean {
  return Boolean(plate && plate.checked && plate.ok === false && !plate.byUser && (plate.tries ?? 1) < ROOM_PLATE_AUTO_TRIES)
}

/** Auftrag an den Maler für das Raumbild als Vorlage. Kamera-Ort. */
export function roomPlateUseEn(place: string): string {
  return `ROOM PLATE of ${place}: the fixed furniture plan of this room. Keep every piece of furniture, every window and every door exactly where it is on this plate and exactly as many: nothing added, nothing removed, nothing moved or turned. The camera may look from another angle of the same room; then other walls of this same room are visible. Ignore that the plate is empty: the people of this picture are added.`
}

/** Raumbild eines Ortes, der nur auf einer Fläche (Bildschirm, Spiegel …) zu sehen ist. */
export function surfacePlateUseEn(place: string, thing: string): string {
  return `ROOM PLATE of ${place}: this room is seen only inside the frame of ${thing}, small, not around the camera. Inside that frame keep its furniture as on this plate.`
}

/** Für die Regie beim Anschauen. */
export function roomPlateRoleDe(place: string): string {
  return `RAUMBILD «${place}», leer: die feste Einrichtung des Ortes der Kamera. Möbel (welche, wie viele, an welcher Wand), Fenster und Türen müssen dazu passen. Andere Blickrichtung im selben Raum ist erlaubt.`
}

/** Unter dem Bild / im Regiebuch, wenn das Raumbild fehlt und nicht gezeichnet werden konnte. */
export function roomPlateFailedDe(place: string, reason: string): string {
  const why = reason.trim().replace(/[.\s]+$/, '') || 'Grund unbekannt'
  return `Das Raumbild «${place}» konnte nicht gezeichnet werden: ${why}. Ohne Raumbild kann sich die Einrichtung von Bild zu Bild ändern.`
}

/** Kurz für das Regiebuch: was die Regie zum Raumbild sagt. */
export function roomPlateStateDe(plate: FilmRoomPlate | undefined): string {
  if (!plate) return 'Noch kein Raumbild.'
  if (!plate.checked) return 'Raumbild steht, die Regie hat es noch nicht angeschaut.'
  if (plate.ok) return plate.noteDe ? `Raumbild passt. ${plate.noteDe}` : 'Raumbild passt.'
  return `Regie: ${plate.noteDe || 'Das Raumbild passt nicht zur Beschreibung.'}`
}

/** Antwort der Regie zum Raumbild lesen. Ohne klares Ja/Nein: nicht geprüft. */
export function readRoomPlateAnswer(raw: unknown): { ok: boolean; noteDe: string; fixEn: string } | null {
  const row = (Array.isArray(raw) ? raw.find((item) => item && typeof item === 'object') : raw) as
    | Record<string, unknown>
    | undefined
  if (!row || typeof row !== 'object') return null
  const clip = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
  const flags = ['empty', 'furniture', 'layout'] as const
  let ok: boolean | null = typeof row.ok === 'boolean' ? row.ok : null
  for (const key of flags) {
    if (row[key] === false) ok = false
  }
  if (ok === null) return null
  return { ok, noteDe: clip(row.noteDe, 240), fixEn: ok ? '' : clip(row.fixEn, 500) }
}
