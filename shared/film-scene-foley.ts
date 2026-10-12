/** Geräusch zu einem Bild: Wasser, Pfeifen, Klopfen — nicht nur Nuss und Stadt. */
export type FoleyKind = 'fill' | 'whistle' | 'pour' | 'knock' | 'crackle'

const FOLEY_LABEL_DE: Record<FoleyKind, string> = {
  fill: 'Wasser läuft in den Teekessel',
  whistle: 'Der Teekessel pfeift',
  pour: 'Tee plätschert in die Kanne',
  knock: 'Klopfen an der Tür',
  crackle: 'Nuss knackt',
}

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

export function foleyEventsFromText(...parts: Array<string | undefined>): FoleyKind[] {
  const t = parts.filter(Boolean).join(' ').toLowerCase()
  if (!t.trim()) return []
  const out: FoleyKind[] = []
  const add = (kind: FoleyKind) => {
    if (!out.includes(kind)) out.push(kind)
  }
  if (/klopf|knock|klingel/.test(t)) add('knock')
  if (/pfeif|whistle|dampf steigt|kessel beginnt|kessel pfeift/.test(t)) add('whistle')
  if (
    /plätscher|eingieß|eingiess|gießt den tee|giesst den tee|gießt tee|giesst tee|in die kanne|in die gläser|schenkt/.test(
      t,
    )
  ) {
    add('pour')
  }
  if (
    /auffüll|füllt wasser|wasser in den|wasser in ein|füllt.*kessel|kessel.*füll|wasser läuft|läuft.*wasser|bereitet tee|tee vorbereit/.test(
      t,
    )
  ) {
    add('fill')
  }
  if (/knister|knack|nuss|nüsse/.test(t)) add('crackle')
  return out
}

export function inferSoundCueDe(text: string, cueSound?: string): string {
  const given = (cueSound || '').trim()
  if (given) return given
  return foleyEventsFromText(text)
    .map((k) => FOLEY_LABEL_DE[k])
    .join(', ')
}

/** Musik hörbar, aber unter dem Dialog. Nuss nur ein Knack. */
export const SCENE_PAD_GAIN = 0.11
export const SCENE_FOLEY_GAIN = 0.14
export const SCENE_VOICE_GAIN = 0.92
export const SCENE_ESTABLISHING_MS = 2200

export function foleyDurationMs(events: FoleyKind[]): number {
  if (events.length === 0) return SCENE_ESTABLISHING_MS
  let ms = 0
  for (const e of events) {
    if (e === 'whistle') ms += 2000
    else if (e === 'pour' || e === 'fill') ms += 2100
    else if (e === 'knock') ms += 1200
    else ms += 500
  }
  return Math.max(SCENE_ESTABLISHING_MS, Math.min(ms, 5200))
}
