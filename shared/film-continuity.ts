/**
 * Eine Regie liest die ganze Geschichte einmal.
 * Dieser Satz geht mit jedem Bild mit. Ein Wort in einer Zeile ändert ihn nicht.
 */

export interface FilmContinuityPerson {
  name: string
  lookEn: string
}

export interface FilmContinuityPlace {
  name: string
  lookEn: string
}

export interface FilmContinuity {
  version: 1
  sourceKey: string
  situationDe: string
  situationEn: string
  /** true: alle physisch zusammen. false: nur wenn die Geschichte ein Videogespräch ist. */
  together: boolean
  people: FilmContinuityPerson[]
  places: FilmContinuityPlace[]
  locksEn: string[]
}

export function continuitySourceKey(text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0
  }
  return `c${(hash >>> 0).toString(36)}:${text.length}`
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function continuityBriefEn(note: FilmContinuity): string {
  const where = note.together
    ? 'They are physically together in one place for this whole story. On a close-up the others are just outside the frame, still in that place. FORBIDDEN: video call, webcam, laptop or phone showing the other face, split screen, each person in a different room.'
    : 'This whole story is a video call. Each person stays in their own room. The other person appears only on a screen. Do not seat them at the same table.'
  const people = note.people.map((person) => `${person.name}: ${person.lookEn}`).join(' ')
  const places = note.places.map((place) => `${place.name}: ${place.lookEn}`).join(' ')
  const locks = note.locksEn.join(' ')
  return [
    'CONTINUITY, decided once for the whole story. A word in one line must not change who these people are or where they are.',
    note.situationEn,
    where,
    people ? `Same people every frame: ${people}.` : '',
    places ? `Same places: ${places}.` : '',
    locks ? `Do not drift: ${locks}` : '',
    'Do not turn them into a known character from a book or a film. Keep the face from the attached reference photo.',
  ]
    .filter(Boolean)
    .join(' ')
}

export function fallbackContinuity(opts: {
  text: string
  people: string[]
  places: string[]
}): FilmContinuity {
  const video = /videochat|videogespräch|videogespraech|video-?anruf|video-?call|per video|zoom|facetime|skype/i.test(
    opts.text,
  )
  const people = [...new Set(opts.people.map((name) => name.trim()).filter(Boolean))].slice(0, 8)
  const places = [...new Set(opts.places.map((name) => name.trim()).filter(Boolean))].slice(0, 6)
  return {
    version: 1,
    sourceKey: continuitySourceKey(opts.text),
    situationDe: video
      ? 'Die Geschichte ist ein Videogespräch. Jede Person bleibt in ihrem Raum.'
      : 'Die Leute sind zusammen am selben Ort. Kein Videogespräch.',
    situationEn: video
      ? 'The characters talk by video call, each in their own room.'
      : 'The characters are physically together in the same place.',
    together: !video,
    people: people.map((name) => ({
      name,
      lookEn: `${name}, the same original face, hair and clothes in every picture.`,
    })),
    places: places.map((name) => ({
      name,
      lookEn: `${name}, the same room and furniture in every picture of this place.`,
    })),
    locksEn: [
      'A mention of a country or a crowd somewhere else does not change the people in this scene.',
      'Clothes, hair, glasses and the room stay as first described.',
    ],
  }
}

export function sanitizeContinuity(
  raw: unknown,
  text: string,
): FilmContinuity | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const situationEn = clip(row.situationEn, 600)
  const situationDe = clip(row.situationDe, 280)
  if (!situationEn || !situationDe) return null
  const people = Array.isArray(row.people)
    ? row.people
        .map((person) => {
          const item = person as Record<string, unknown>
          const name = clip(item?.name, 40)
          const lookEn = clip(item?.lookEn, 240)
          return name && lookEn ? { name, lookEn } : null
        })
        .filter((person): person is FilmContinuityPerson => Boolean(person))
        .slice(0, 8)
    : []
  const places = Array.isArray(row.places)
    ? row.places
        .map((place) => {
          const item = place as Record<string, unknown>
          const name = clip(item?.name, 40)
          const lookEn = clip(item?.lookEn, 240)
          return name && lookEn ? { name, lookEn } : null
        })
        .filter((place): place is FilmContinuityPlace => Boolean(place))
        .slice(0, 6)
    : []
  const locksEn = Array.isArray(row.locksEn)
    ? row.locksEn.map((line) => clip(line, 200)).filter(Boolean).slice(0, 8)
    : []
  return {
    version: 1,
    sourceKey: continuitySourceKey(text),
    situationDe,
    situationEn,
    together: row.together !== false,
    people,
    places,
    locksEn,
  }
}
