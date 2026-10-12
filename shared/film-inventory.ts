/**
 * Drehbuch-Inventar: Figuren, Orte, jede wiederkehrende Sache mit fester id.
 * Die ids kommen aus der Geschichte (Blumen, Mantel, Zeitung, Kanne, …).
 * Zebla denkt nicht — es reicht die richtigen Fotos weiter.
 */

import {
  inferDialogLineKind,
  isStageSpeaker,
  type Dialog,
  type DialogSection,
  type FilmInventory,
  type FilmInventoryPlace,
  type FilmInventoryProp,
  type FilmRefNeeds,
} from './types.js'
import { inferFilmPlaceKey, placeLabelDe } from './film-place.js'

export type KnownFilmProp = {
  id: string
  nameDe: string
  nameEn: string
  words: string[]
}

/**
 * Wort-Hinweise, falls die KI eine id vergisst.
 * Das Inventar selbst ist offen — keine geschlossene Kanne/Tablett-Liste.
 */
export const KNOWN_FILM_PROPS: KnownFilmProp[] = [
  {
    id: 'kanne-1',
    nameDe: 'Kanne',
    nameEn: 'kettle',
    words: ['kanne', 'kessel', 'teekessel', 'teekanne', 'kettle', 'teapot'],
  },
  {
    id: 'tablett-1',
    nameDe: 'Tablett',
    nameEn: 'tray',
    words: ['tablett', 'tray', 'tablettt'],
  },
  {
    id: 'schloss-1',
    nameDe: 'Türschloss',
    nameEn: 'door lock',
    words: ['schloss', 'türschloss', 'tuerschloss', 'door lock', 'riegel', 'klinke'],
  },
]

export function slugPropId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function uniqueStable(ids: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of ids) {
    const id = slugPropId(raw)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function knownPropById(id: string): KnownFilmProp | undefined {
  const key = slugPropId(id)
  return KNOWN_FILM_PROPS.find((p) => p.id === key)
}

export function propLabelDe(id: string, inventory?: FilmInventory | null): string {
  const fromInv = inventory?.props.find((p) => slugPropId(p.id) === slugPropId(id))
  if (fromInv?.nameDe?.trim()) return fromInv.nameDe.trim()
  const known = knownPropById(id)
  if (known) return known.nameDe
  const guessed = guessPropEnglish(id)
  if (guessed?.de) return guessed.de
  return id
}

export function propLabelEn(id: string, inventory?: FilmInventory | null): string {
  const known = knownPropById(id)
  if (known) return known.nameEn
  const de = propLabelDe(id, inventory)
  const guessed = guessPropEnglish(`${id} ${de}`)
  if (guessed?.en) return guessed.en
  if (de && slugPropId(de) !== slugPropId(id)) return de.toLowerCase()
  const fromId = slugPropId(id).replace(/-\d+$/, '').replace(/-/g, ' ')
  return fromId || id
}

function guessPropEnglish(raw: string): { de: string; en: string } | undefined {
  const t = `${raw} ${slugPropId(raw)}`.toLowerCase()
  if (/blume|flower|bouquet|strauss|tulpe/.test(t)) return { de: 'Blumen', en: 'flowers' }
  if (/mantel|jacke|coat/.test(t)) return { de: 'Mantel', en: 'coat' }
  if (/zeitung|newspaper/.test(t)) return { de: 'Zeitung', en: 'newspaper' }
  if (/kanne|kessel|teapot|kettle/.test(t)) return { de: 'Kanne', en: 'kettle' }
  if (/tablett|tray/.test(t)) return { de: 'Tablett', en: 'tray' }
  if (/schloss|klinke|lock/.test(t)) return { de: 'Türschloss', en: 'door lock' }
  return undefined
}

export function inferPropIdsFromText(
  text: string,
  inventory?: FilmInventory | null,
): string[] {
  const t = (text || '').toLowerCase()
  if (!t.trim()) return []
  const fromKnown = KNOWN_FILM_PROPS.filter((p) => p.words.some((w) => t.includes(w))).map(
    (p) => p.id,
  )
  const fromInv = (inventory?.props ?? [])
    .filter((p) => textMentionsProp(t, p))
    .map((p) => p.id)
  return uniqueStable([...fromKnown, ...fromInv])
}

function textMentionsProp(textLower: string, prop: FilmInventoryProp): boolean {
  const name = (prop.nameDe || '').trim().toLowerCase()
  if (name.length >= 3 && textLower.includes(name)) return true
  const stem = slugPropId(prop.id).replace(/-\d+$/, '').replace(/-/g, '')
  if (stem.length >= 4 && textLower.includes(stem)) return true
  return false
}

export function normalizeFilmInventory(
  raw?: FilmInventory | null,
): FilmInventory | null {
  if (!raw) return null
  const people = (raw.people ?? [])
    .map((p) => ({ name: (p.name || '').trim() }))
    .filter((p) => p.name && !isStageSpeaker(p.name))
  const seenPeople = new Set<string>()
  const peopleOut = people.filter((p) => {
    const k = p.name.toLowerCase()
    if (seenPeople.has(k)) return false
    seenPeople.add(k)
    return true
  })
  const places: FilmInventoryPlace[] = []
  const seenPlaces = new Set<string>()
  for (const place of raw.places ?? []) {
    const key = (place.key || inferFilmPlaceKey(place.labelDe || '')).trim()
    if (!key || seenPlaces.has(key)) continue
    seenPlaces.add(key)
    places.push({
      key,
      labelDe: place.labelDe?.trim() || placeLabelDe(inferFilmPlaceKey(key)),
    })
  }
  const props: FilmInventoryProp[] = []
  const seenProps = new Set<string>()
  for (const prop of raw.props ?? []) {
    const id = slugPropId(prop.id || prop.nameDe || '')
    if (!id || seenProps.has(id)) continue
    seenProps.add(id)
    const known = knownPropById(id)
    props.push({
      id,
      nameDe: prop.nameDe?.trim() || known?.nameDe || propLabelDe(id) || id,
      firstSeenLineHint: prop.firstSeenLineHint?.trim() || undefined,
    })
  }
  if (!peopleOut.length && !places.length && !props.length) return null
  return { people: peopleOut, places, props }
}

export function deriveFilmInventory(dialog: Pick<Dialog, 'sections' | 'filmInventory'>): FilmInventory {
  const fromAi = normalizeFilmInventory(dialog.filmInventory)
  const people: { name: string }[] = [...(fromAi?.people ?? [])]
  const seenPeople = new Set(people.map((p) => p.name.toLowerCase()))
  const places: FilmInventoryPlace[] = [...(fromAi?.places ?? [])]
  const seenPlaces = new Set(places.map((p) => p.key))
  const props: FilmInventoryProp[] = [...(fromAi?.props ?? [])]
  const seenProps = new Set(props.map((p) => p.id))

  for (const section of dialog.sections) {
    for (const line of section.lines) {
      const kind = inferDialogLineKind(line)
      const speaker = (line.speaker || '').trim()
      if (speaker && kind === 'speech' && !isStageSpeaker(speaker) && !seenPeople.has(speaker.toLowerCase())) {
        seenPeople.add(speaker.toLowerCase())
        people.push({ name: speaker })
      }
      const blob = `${line.text} ${line.cueImage || ''} ${section.title}`
      const placeKey = inferFilmPlaceKey(blob)
      if (placeKey !== 'other' && !seenPlaces.has(placeKey)) {
        seenPlaces.add(placeKey)
        places.push({ key: placeKey, labelDe: placeLabelDe(placeKey) })
      }
      const growing: FilmInventory = { people, places, props }
      const ids = uniqueStable([
        ...(line.propIds ?? []),
        ...inferPropIdsFromText(blob, fromAi),
        ...inferPropIdsFromText(blob, growing),
      ])
      for (const id of ids) {
        if (seenProps.has(id)) continue
        seenProps.add(id)
        const fromAiProp = fromAi?.props.find((p) => p.id === id)
        const known = knownPropById(id)
        props.push({
          id,
          nameDe: fromAiProp?.nameDe || known?.nameDe || propLabelDe(id) || id,
          firstSeenLineHint: (line.text || line.cueImage || '').trim().slice(0, 80) || undefined,
        })
      }
    }
  }
  return { people, places, props }
}

export function mergeLinePropIds(
  line: {
    text?: string
    cueImage?: string
    propIds?: string[]
  },
  inventory?: FilmInventory | null,
): string[] {
  return uniqueStable([
    ...(line.propIds ?? []),
    ...inferPropIdsFromText(`${line.text || ''} ${line.cueImage || ''}`, inventory),
  ])
}

export function hasSameObjectCue(cue: string): boolean {
  return /\bsame\b.+\bas earlier\b/i.test(cue)
}

export function continuityCueForPropIds(
  ids: string[],
  inventory?: FilmInventory | null,
): string {
  const names: string[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    const name = propLabelEn(id, inventory)
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  if (!names.length) return 'SAME object as earlier'
  if (names.length === 1) return `SAME ${names[0]} as earlier`
  return `SAME ${names.join('/')} as earlier`
}

/** Spätere Zeilen merken: dieselbe Sache wie im ersten Foto. */
export function applyContinuityCues(
  sections: DialogSection[],
  inventory?: FilmInventory | null,
): DialogSection[] {
  const seen = new Set<string>()
  return sections.map((sec) => ({
    ...sec,
    lines: sec.lines.map((line) => {
      const ids = mergeLinePropIds(line, inventory)
      const repeats = ids.filter((id) => seen.has(id))
      for (const id of ids) seen.add(id)
      const next = { ...line, propIds: ids.length ? ids : undefined }
      if (!repeats.length) return next
      const cue = next.cueImage || ''
      if (hasSameObjectCue(cue)) return next
      const extra = continuityCueForPropIds(repeats, inventory)
      return { ...next, cueImage: cue ? `${cue}. ${extra}` : extra }
    }),
  }))
}

export function deriveRefNeeds(opts: {
  people: string[]
  settingHint?: string
  caption?: string
  imageCue?: string
  propIds?: string[]
  inventory?: FilmInventory | null
}): FilmRefNeeds {
  const blob = `${opts.caption || ''} ${opts.imageCue || ''} ${opts.settingHint || ''}`
  const place = inferFilmPlaceKey(opts.settingHint || blob)
  const inventoryPeople = new Set((opts.inventory?.people ?? []).map((p) => p.name.toLowerCase()))
  const people = [...new Set(opts.people.map((n) => n.trim()).filter(Boolean))].filter(
    (n) => !inventoryPeople.size || inventoryPeople.has(n.toLowerCase()) || !isStageSpeaker(n),
  )
  const propIds = uniqueStable([
    ...(opts.propIds ?? []),
    ...inferPropIdsFromText(blob, opts.inventory),
  ]).filter((id) => {
    if (!opts.inventory?.props.length) return true
    return opts.inventory.props.some((p) => p.id === id)
  })
  const places = place === 'other' ? [] : [place]
  return { people, places, propIds }
}

export function emptyRefNeeds(): FilmRefNeeds {
  return { people: [], places: [], propIds: [] }
}

export function mergeRefNeeds(a?: FilmRefNeeds | null, b?: FilmRefNeeds | null): FilmRefNeeds {
  return {
    people: [...new Set([...(a?.people ?? []), ...(b?.people ?? [])].map((n) => n.trim()).filter(Boolean))],
    places: uniqueStable([...(a?.places ?? []), ...(b?.places ?? [])]),
    propIds: uniqueStable([...(a?.propIds ?? []), ...(b?.propIds ?? [])]),
  }
}
