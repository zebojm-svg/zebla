/** Welche Geräusche zur Ton-Notiz der Szene gehören. */

export function foleyFlagsFromNote(note?: string): { crackle: boolean; city: boolean } {
  const t = (note || '').toLowerCase()
  return {
    crackle: /knister|nuss|nüsse|nuts?|cracker/.test(t),
    city: /stadt|city|verkehr|straße|strasse|traffic|urban/.test(t),
  }
}
