/** Welche Geräusche zur Ton-Notiz der Szene gehören. */

export function foleyFlagsFromNote(note?: string): { crackle: boolean; city: boolean } {
  const t = (note || '').toLowerCase()
  return {
    crackle: /knister|knack|nuss|nüsse|nuts?|cracker/.test(t),
    city: /stadt|city|verkehr|straße|strasse|traffic|urban/.test(t),
  }
}

/** Pad bleibt leise; Stimme und Foley liegen auf eigenen Lautstärken. */
export const SCENE_PAD_GAIN = 0.022
export const SCENE_FOLEY_GAIN = 0.16
export const SCENE_VOICE_GAIN = 0.92
export const SCENE_ESTABLISHING_MS = 2200
