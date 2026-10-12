/** Welche Geräusche zur Ton-Notiz der Szene gehören. */

export function foleyFlagsFromNote(note?: string): { crackle: boolean; city: boolean } {
  const t = (note || '').toLowerCase()
  const wantsMusic = /musik|music|tar|setar|santur|dastgah|persisch/.test(t)
  const asksCity = /stadtrauschen|stadtlärm|stadtlarm|stadtgeräusch|stadtgerausch|verkehrslärm|straßenlärm|strassenlarm/.test(
    t,
  )
  return {
    crackle: /knister|knack|nuss|nüsse|nuts?|cracker/.test(t),
    // Wohnzimmer + Musik: kein Stadtbrummen, auch wenn die KI «Stadtgeräusche» mitgeschrieben hat.
    city: asksCity && !wantsMusic,
  }
}

/** Musik hörbar, aber unter dem Dialog. Nuss nur ein Knack. */
export const SCENE_PAD_GAIN = 0.11
export const SCENE_FOLEY_GAIN = 0.14
export const SCENE_VOICE_GAIN = 0.92
export const SCENE_ESTABLISHING_MS = 2200
