/**
 * Eine Regie liest die ganze Geschichte einmal.
 * Dieser Satz geht mit jedem Bild mit. Ein Wort in einer Zeile ändert ihn nicht.
 */

export interface FilmContinuityPerson {
  name: string
  lookEn: string
  /** Dasselbe auf Deutsch, für das Regiebuch. */
  lookDe?: string
}

export interface FilmContinuityPlace {
  name: string
  lookEn: string
  lookDe?: string
}

/** Ein Blick. Spätere Bilder desselben Blicks bekommen das frühere Foto mit. */
export interface FilmShotLink {
  panelId: string
  viewKey: string
  sendViewKeys: string[]
  whyDe: string
}

export interface FilmContinuityPanel {
  id: string
  shot?: string
  settingHint?: string
  closeupSpeaker?: string
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
  shots: FilmShotLink[]
  /** Seitenansicht wurde mit dem Stammbild verglichen. */
  sideChecked?: string[]
  /** Einmal neu gezeichnet, weil die erste Seitenansicht nicht passte. */
  sideTries?: string[]
  /** Jean-Marie hat das Regiebuch geändert. Die Regie liest es nicht über, sie nimmt es als Vorgabe. */
  byUser?: boolean
  /** Was sonst gilt, von Jean-Marie, eine Sache pro Zeile. */
  notesDe?: string[]
  /** Welches Modell die Geschichte gelesen hat. */
  readModel?: string
  /** Warum nicht Pro («Flash statt Pro, weil …»). */
  readModelNoteDe?: string
}

/** Was im Regiebuch auf Deutsch steht und geändert werden kann. */
export interface RegiebuchEdit {
  situationDe: string
  people: Array<{ name: string; lookDe: string }>
  places: Array<{ name: string; lookDe: string }>
  notesDe: string[]
}

export function regiebuchVorgabenDe(edit: RegiebuchEdit): string {
  return [
    `Lage: ${edit.situationDe}`,
    ...edit.people.map((person) => `${person.name}: ${person.lookDe}`),
    ...edit.places.map((place) => `Ort ${place.name}: ${place.lookDe}`),
    ...edit.notesDe.map((note) => `Gilt: ${note}`),
  ]
    .filter((line) => line.trim())
    .join('\n')
}

export function regiebuchFromContinuity(note: FilmContinuity): RegiebuchEdit {
  return {
    situationDe: note.situationDe,
    people: note.people.map((person) => ({ name: person.name, lookDe: person.lookDe ?? '' })),
    places: note.places.map((place) => ({ name: place.name, lookDe: place.lookDe ?? '' })),
    notesDe: note.notesDe ?? [],
  }
}

export function sanitizeRegiebuchEdit(raw: unknown): RegiebuchEdit | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const named = (list: unknown, max: number) =>
    Array.isArray(list)
      ? list
          .map((item) => {
            const entry = item as Record<string, unknown>
            const name = clip(entry?.name, 40)
            return name ? { name, lookDe: clip(entry?.lookDe, 600) } : null
          })
          .filter((item): item is { name: string; lookDe: string } => Boolean(item))
          .slice(0, max)
      : []
  return {
    situationDe: clip(row.situationDe, 600),
    people: named(row.people, 8),
    places: named(row.places, 6),
    notesDe: Array.isArray(row.notesDe)
      ? row.notesDe.map((line) => clip(line, 240)).filter(Boolean).slice(0, 12)
      : [],
  }
}

export type FilmRefJob =
  | { kind: 'person-front'; name: string }
  | { kind: 'person-side'; name: string }
  | { kind: 'person-check'; name: string }
  | { kind: 'place'; name: string }

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
    : 'This whole story is a video call. Each person stays in their own room. The other person appears only once, inside a single laptop screen. Never two copies of the same person, never a second screen, never an extra stranger, never both sitting at one table.'
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
    'When an earlier picture of this same camera angle is attached, match that picture. A new angle may move the camera. It must not change faces, clothes, furniture or who is in the room.',
    'Do not turn them into a known character from a book or a film. Keep the face from the attached reference photo.',
  ]
    .filter(Boolean)
    .join(' ')
}

export function fallbackShots(panels: FilmContinuityPanel[]): FilmShotLink[] {
  const seen = new Map<string, true>()
  return panels.map((panel, index) => {
    const place = (panel.settingHint || 'ort').trim().slice(0, 40).toLowerCase() || 'ort'
    const shot = panel.shot || 'wide'
    const viewKey =
      shot === 'closeup'
        ? `${place}|nah|${(panel.closeupSpeaker || 'person').trim().toLowerCase()}`
        : shot === 'insert'
          ? `${place}|detail|${index}`
          : `${place}|weit`
    const send: string[] = []
    if (seen.has(viewKey)) send.push(viewKey)
    const wideKey = `${place}|weit`
    if (shot !== 'wide' && seen.has(wideKey) && !send.includes(wideKey)) send.push(wideKey)
    seen.set(viewKey, true)
    const whyDe = send.includes(viewKey)
      ? 'Gleicher Blick wie ein früheres Bild. Das frühere Bild geht mit.'
      : shot === 'closeup'
        ? `Nah auf ${panel.closeupSpeaker || 'die Person'}. Der weite Blick dieses Ortes geht mit, sobald er existiert.`
        : shot === 'insert'
          ? 'Neues Detail. Der weite Blick dieses Ortes geht mit, sobald er existiert.'
          : 'Erster Blick auf diesen Ort. Spätere Bilder dieses Blicks hängen daran.'
    return { panelId: panel.id, viewKey, sendViewKeys: send, whyDe }
  })
}

export function fallbackContinuity(opts: {
  text: string
  people: string[]
  places: string[]
  panels?: FilmContinuityPanel[]
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
    shots: fallbackShots(opts.panels ?? []),
  }
}

/** Ein Regiebuch, das die Regie wirklich gelesen oder Jean-Marie geschrieben hat — nicht der Ersatz ohne KI. */
export function isRegieReading(note: FilmContinuity): boolean {
  if (note.byUser) return true
  if ([...note.people, ...note.places].some((item) => item.lookDe?.trim())) return true
  const bare = fallbackContinuity({ text: '', people: [], places: [] })
  const bareVideo = fallbackContinuity({ text: 'videochat', people: [], places: [] })
  return Boolean(note.situationEn) && note.situationEn !== bare.situationEn && note.situationEn !== bareVideo.situationEn
}

/** Warum die Antwort der Regie nicht als Regiebuch taugt, kurz auf Deutsch. */
export function continuityProblemDe(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return 'Die Antwort der Regie war kein Regiebuch'
  const row = raw as Record<string, unknown>
  const missing = [
    typeof row.situationDe === 'string' && row.situationDe.trim() ? '' : '«Wo und wie» auf Deutsch',
    typeof row.situationEn === 'string' && row.situationEn.trim() ? '' : '«Wo und wie» auf Englisch',
  ].filter(Boolean)
  return missing.length ? `In der Antwort fehlte ${missing.join(' und ')}` : 'Die Antwort der Regie war unvollständig'
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function nameWords(name: string): string[] {
  return name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

function startsWithWords(words: string[], head: string[]): boolean {
  return head.length > 0 && head.length <= words.length && head.every((word, index) => words[index] === word)
}

/**
 * Ein Raum ist ein Ort. «Lenas Zimmer Karte» oder «Lenas Zimmer (Fenster)» ist «Lenas Zimmer».
 * Ohne Treffer: undefined.
 */
export function placeForName(known: string[], raw: string): string | undefined {
  const exact = known.find((name) => sameName(name, raw))
  if (exact) return exact
  const words = nameWords(raw)
  return known
    .filter((name) => startsWithWords(words, nameWords(name)))
    .sort((a, b) => nameWords(b).length - nameWords(a).length)[0]
}

/** Sätze, in denen eine Person vorkommt, gehören nicht in die Beschreibung eines Ortes. */
export function withoutPeople(text: string, names: string[]): string {
  const patterns = names
    .map((name) => name.trim())
    .filter((name) => name.length >= 2)
    .map((name) => new RegExp(`(^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\p{L})(?!['’]s\\b)`, 'iu'))
  if (!patterns.length) return text
  const sentences = text.split(/(?<=[.!?;])\s+/)
  const kept = sentences.filter((sentence) => !patterns.some((pattern) => pattern.test(sentence)))
  return kept.length ? kept.join(' ').trim() : text
}

function mergePlaces(places: FilmContinuityPlace[]): FilmContinuityPlace[] {
  const names = places.map((place) => place.name)
  const kept: FilmContinuityPlace[] = []
  for (const place of places) {
    const others = names.filter((name) => !sameName(name, place.name))
    const owner = placeForName(others, place.name) ?? place.name
    const root = placeForName(names.filter((name) => !sameName(name, owner)), owner) ?? owner
    if (kept.some((have) => sameName(have.name, root))) continue
    kept.push(places.find((item) => sameName(item.name, root)) ?? place)
  }
  return kept
}

/** «lenas zimmer karte|weit» wird «lenas zimmer|karte|weit», wenn die Karte zu Lenas Zimmer gehört. */
function remapViewKey(key: string, placeNames: string[], heads: Map<string, string>): string {
  const cut = key.indexOf('|')
  const head = cut >= 0 ? key.slice(0, cut) : key
  const rest = cut >= 0 ? key.slice(cut) : ''
  const place = placeForName(placeNames, head)
  if (!place) return key
  const words = nameWords(head)
  const placeWords = nameWords(place)
  if (words.length === placeWords.length) return key
  const placeHead = heads.get(place.toLowerCase()) ?? place.toLowerCase()
  return `${placeHead}|${words.slice(placeWords.length).join(' ')}${rest}`
}

function wordSet(text: string): Set<string> {
  return new Set(nameWords(text).filter((word) => word.length > 3))
}

/** Zwei verschiedene Orte, die fast gleich beschrieben sind. */
export function placesTooAlike(places: FilmContinuityPlace[], limit = 0.55): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      const a = wordSet(places[i]!.lookDe || places[i]!.lookEn)
      const b = wordSet(places[j]!.lookDe || places[j]!.lookEn)
      if (a.size < 8 || b.size < 8) continue
      const both = [...a].filter((word) => b.has(word)).length
      if (both / (a.size + b.size - both) >= limit) pairs.push([places[i]!.name, places[j]!.name])
    }
  }
  return pairs
}

export function directorStillUrls(
  panels: Array<{ id: string; stillUrl?: string }>,
  continuity: FilmContinuity | undefined,
  panelId: string,
): Array<{ url: string; name: string }> {
  const shot = continuity?.shots?.find((item) => item.panelId === panelId)
  if (!shot) return []
  const index = panels.findIndex((panel) => panel.id === panelId)
  const earlier = index >= 0 ? panels.slice(0, index) : []
  const urls: Array<{ url: string; name: string }> = []
  for (const key of shot.sendViewKeys) {
    const source = continuity?.shots?.find(
      (item) => item.viewKey === key && item.panelId !== panelId,
    )
    const prev = earlier.find((panel) => panel.id === source?.panelId && panel.stillUrl?.startsWith('http'))
    if (!prev?.stillUrl) continue
    if (urls.some((item) => item.url === prev.stillUrl)) continue
    urls.push({ url: prev.stillUrl, name: source?.whyDe || 'früheres Bild' })
  }
  return urls.slice(0, 2)
}

export function referenceJobs(opts: {
  continuity: FilmContinuity
  hasFront: (name: string) => boolean
  hasSide: (name: string) => boolean
  hasPlace: (name: string) => boolean
}): FilmRefJob[] {
  const jobs: FilmRefJob[] = []
  const checked = opts.continuity.sideChecked ?? []
  for (const person of opts.continuity.people) {
    if (!opts.hasFront(person.name)) {
      jobs.push({ kind: 'person-front', name: person.name })
      continue
    }
    if (!opts.hasSide(person.name)) {
      jobs.push({ kind: 'person-side', name: person.name })
      continue
    }
    if (!checked.some((name) => sameName(name, person.name))) {
      jobs.push({ kind: 'person-check', name: person.name })
    }
  }
  for (const place of opts.continuity.places) {
    const name = place.name.trim()
    if (name.length < 2 || name.length > 40) continue
    if (!opts.hasPlace(name)) jobs.push({ kind: 'place', name })
  }
  return jobs
}

export function sanitizeContinuity(
  raw: unknown,
  text: string,
  panels: FilmContinuityPanel[] = [],
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
          const lookEn = clip(item?.lookEn, 400)
          const lookDe = clip(item?.lookDe, 500)
          return name && lookEn ? { name, lookEn, ...(lookDe ? { lookDe } : {}) } : null
        })
        .filter((person): person is FilmContinuityPerson => Boolean(person))
        .slice(0, 8)
    : []
  const places = Array.isArray(row.places)
    ? row.places
        .map((place) => {
          const item = place as Record<string, unknown>
          const name = clip(item?.name, 40)
          const lookEn = clip(item?.lookEn, 900)
          const lookDe = clip(item?.lookDe, 900)
          return name && lookEn ? { name, lookEn, ...(lookDe ? { lookDe } : {}) } : null
        })
        .filter((place): place is FilmContinuityPlace => Boolean(place))
    : []
  const locksEn = Array.isArray(row.locksEn)
    ? row.locksEn.map((line) => clip(line, 200)).filter(Boolean).slice(0, 8)
    : []
  const known = new Set(panels.map((panel) => panel.id))
  const fromAi = Array.isArray(row.shots)
    ? row.shots
        .map((shot) => {
          const item = shot as Record<string, unknown>
          const panelId = clip(item?.panelId, 80)
          const viewKey = clip(item?.viewKey, 80)
          if (!panelId || !viewKey || (known.size && !known.has(panelId))) return null
          const sendViewKeys = Array.isArray(item?.sendViewKeys)
            ? item.sendViewKeys.map((key) => clip(key, 80)).filter(Boolean).slice(0, 3)
            : []
          return {
            panelId,
            viewKey,
            sendViewKeys,
            whyDe: clip(item?.whyDe, 180) || 'Dieser Blick bleibt.',
          }
        })
        .filter((shot): shot is FilmShotLink => Boolean(shot))
    : []
  const fallback = fallbackShots(panels)
  const shots = fallback.map((shot) => fromAi.find((item) => item.panelId === shot.panelId) ?? shot)
  return tidyContinuity({
    version: 1,
    sourceKey: continuitySourceKey(text),
    situationDe,
    situationEn,
    together: row.together !== false,
    people,
    places,
    locksEn,
    shots,
  })
}

function remapShots(shots: FilmShotLink[], placeNames: string[]): FilmShotLink[] {
  const heads = new Map<string, string>()
  for (const shot of shots) {
    const head = shot.viewKey.split('|')[0] ?? ''
    const place = placeForName(placeNames, head)
    if (place && nameWords(head).length === nameWords(place).length && !heads.has(place.toLowerCase())) {
      heads.set(place.toLowerCase(), head)
    }
  }
  return shots.map((shot) => ({
    ...shot,
    viewKey: remapViewKey(shot.viewKey, placeNames, heads),
    sendViewKeys: [...new Set((shot.sendViewKeys ?? []).map((key) => remapViewKey(key, placeNames, heads)))],
  }))
}

/**
 * Ein Raum = ein Ort, Orte ohne Leute. Läuft auch über gespeicherte Regiebücher, ohne neu zu lesen.
 * Hat Jean-Marie das Regiebuch geändert, bleiben seine Texte; nur doppelte Orte fallen zusammen.
 */
export function tidyContinuity(note: FilmContinuity): FilmContinuity {
  const names = (note.people ?? []).map((person) => person.name)
  const looked = note.byUser
    ? (note.places ?? [])
    : (note.places ?? []).map((place) => ({
        ...place,
        lookEn: withoutPeople(place.lookEn ?? '', names),
        ...(place.lookDe ? { lookDe: withoutPeople(place.lookDe, names) } : {}),
      }))
  const places = mergePlaces(looked).slice(0, 6)
  return { ...note, places, shots: remapShots(note.shots ?? [], places.map((place) => place.name)) }
}
