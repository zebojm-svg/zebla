/**
 * Drehbuch-Inventar: Figuren, Orte, Requisiten mit fester id.
 * Zebla denkt nicht — es reicht die richtigen Fotos weiter.
 */

import {
  inferDialogLineKind,
  isStageSpeaker,
  type Dialog,
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

/** Dieselbe Kanne / dasselbe Tablett behalten dieselbe id über alle Szenen. */
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
  return knownPropById(id)?.nameDe || id
}

export function propLabelEn(id: string, inventory?: FilmInventory | null): string {
  const known = knownPropById(id)
  if (known) return known.nameEn
  const de = propLabelDe(id, inventory).toLowerCase()
  if (/kanne|kessel/.test(de)) return 'kettle'
  if (/tablett/.test(de)) return 'tray'
  if (/schloss/.test(de)) return 'door lock'
  return de || id
}

export function inferPropIdsFromText(text: string): string[] {
  const t = (text || '').toLowerCase()
  if (!t.trim()) return []
  return KNOWN_FILM_PROPS.filter((p) => p.words.some((w) => t.includes(w))).map((p) => p.id)
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
      nameDe: prop.nameDe?.trim() || known?.nameDe || id,
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
      const ids = uniqueStable([...(line.propIds ?? []), ...inferPropIdsFromText(blob)])
      for (const id of ids) {
        if (seenProps.has(id)) continue
        seenProps.add(id)
        const known = knownPropById(id)
        props.push({
          id,
          nameDe: known?.nameDe || id,
          firstSeenLineHint: (line.text || line.cueImage || '').trim().slice(0, 80) || undefined,
        })
      }
    }
  }
  return { people, places, props }
}

export function mergeLinePropIds(line: {
  text?: string
  cueImage?: string
  propIds?: string[]
}): string[] {
  return uniqueStable([...(line.propIds ?? []), ...inferPropIdsFromText(`${line.text || ''} ${line.cueImage || ''}`)])
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
    ...inferPropIdsFromText(blob),
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
