/**
 * Standbilder für eine Film-Szene — fertige Bilder, kein bewegter Film.
 * Bibliothek zuerst (Gesichter festhalten), Stil aus dem Film-Schritt.
 */

import { closeupSpaceLine, seatSideFromX } from './film-closeup-space.js'
import {
  inferFilmPlaceKey,
  placeLabelDe,
  placeLabelEn,
  placeLockEn,
  settingHintForPlace,
  type FilmPlaceKey,
} from './film-place.js'
import { getStoryArtStyle, getStoryStylePrompt } from './story-art-styles.js'
import { STORY_STILLS_LOCK_PROMPT } from './story-stills.js'
import { teaBeatLockEn } from './film-scene-foley.js'
import { lookForCharacterName } from './story-character-looks.js'
import {
  inferPropIdsFromText,
  propLabelDe,
  propLabelEn,
  uniqueStable,
} from './film-inventory.js'
import type { FilmInventory } from './types.js'
import {
  normalizeFilmStoryboard,
  type FilmPlacement,
  type FilmStoryboard,
  type FilmStoryboardPanel,
} from './film-storyboard.js'

export function panelsForScene(
  board: FilmStoryboard | null | undefined,
  sceneId: string,
): FilmStoryboardPanel[] {
  if (!board) return []
  return normalizeFilmStoryboard(board).panels.filter((p) => p.sceneId === sceneId)
}

export function sceneStillProgress(
  panels: FilmStoryboardPanel[],
  styleId?: string,
): { total: number; done: number; pending: number } {
  const total = panels.length
  const done = panels.filter((p) => {
    if (!p.stillUrl) return false
    if (panelStillNeedsRefresh(p)) return false
    if (styleId && p.stillStyleId && p.stillStyleId !== styleId) return false
    return true
  }).length
  return { total, done, pending: Math.max(0, total - done) }
}

/** Nach «Bild ändern»: spätere Bilder dieser Szene müssen die neue Vorlage sehen. */
export const STALE_STILL_NOTE_DE = 'Vorlage hat sich geändert'

export function panelStillNeedsRefresh(panel: Pick<FilmStoryboardPanel, 'harvestNoteDe'>): boolean {
  return (panel.harvestNoteDe || '').includes(STALE_STILL_NOTE_DE)
}

/** Welche Bilder in der Szene noch fehlen (oder den Stil nicht mehr haben). */
export function panelsNeedingStills(
  panels: FilmStoryboardPanel[],
  styleId?: string,
  force = false,
): FilmStoryboardPanel[] {
  if (force) return [...panels]
  return panels.filter((p) => {
    if (!p.stillUrl) return true
    if (panelStillNeedsRefresh(p)) return true
    if (styleId && p.stillStyleId && p.stillStyleId !== styleId) return true
    return false
  })
}

export function stillLibraryHintDe(panels: FilmStoryboardPanel[]): string | null {
  const missingPeople = new Set<string>()
  const missingPoses = new Set<string>()
  let bgMissing = false
  for (const panel of panels) {
    for (const pl of panel.placements) {
      if (pl.match !== 'missing') continue
      if (pl.imageUrl) missingPoses.add(`${pl.name} (${pl.poseHint})`)
      else missingPeople.add(pl.name)
    }
    if (panel.background.match === 'missing') bgMissing = true
  }
  if (missingPeople.size === 0 && missingPoses.size === 0 && !bgMissing) return null
  const bits: string[] = []
  if (missingPeople.size > 0) {
    bits.push(`${[...missingPeople].join(', ')} fehlt noch in der Bibliothek`)
  }
  if (missingPoses.size > 0) {
    bits.push(`Diese Pose fehlt noch: ${[...missingPoses].join(', ')}`)
  }
  if (bgMissing) bits.push('Der Hintergrund fehlt in der Bibliothek')
  return `${bits.join('. ')}. Das Standbild entsteht trotzdem. Für gleiche Gesichter und Orte: in der Bibliothek zeichnen.`
}

const FILM_STILL_LANGUAGE_EN: Record<string, string> = {
  de: 'German',
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  ja: 'Japanese',
  zh: 'Chinese',
  ar: 'Arabic',
  fa: 'Persian/Dari',
  ru: 'Russian',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  el: 'Greek',
  cs: 'Czech',
  hu: 'Hungarian',
  ko: 'Korean',
}

/** Sprache für sichtbaren Text im Bild (Schilder, Prospekt, Stand). */
export function filmStillLanguageEn(code?: string): string {
  if (!code?.trim()) return 'the film target language'
  return FILM_STILL_LANGUAGE_EN[code.trim().slice(0, 2).toLowerCase()] ?? code.trim()
}

/**
 * Vollständiger Raum + vollständige Figuren. Kein voriges Standbild —
 * sonst kopiert die KI dasselbe Wohnzimmer zehnmal.
 */
export function sceneWidePanel(
  board: FilmStoryboard,
  panel: FilmStoryboardPanel,
): FilmStoryboardPanel | undefined {
  const same = board.panels.filter(
    (p) => p.sceneId === panel.sceneId && p.id !== panel.id && Boolean(p.stillUrl?.startsWith('http')),
  )
  return same.find((p) => p.shot === 'wide')
}

export function sceneWideStillUrl(
  board: FilmStoryboard,
  panel: FilmStoryboardPanel,
): string | undefined {
  return sceneWidePanel(board, panel)?.stillUrl
}

/** Erstes Weit-Bild der Szene — das Grundbild (Raum + wer wo sitzt). */
export function sceneGrundbildPanel(
  board: FilmStoryboard,
  sceneId: string,
): FilmStoryboardPanel | undefined {
  const same = panelsForScene(board, sceneId).filter((p) => Boolean(p.stillUrl?.startsWith('http')))
  return same.find((p) => p.shot === 'wide')
}

export function panelPlaceKey(
  panel: Pick<FilmStoryboardPanel, 'settingHint' | 'imageCue' | 'caption'>,
): FilmPlaceKey {
  const hint = (panel.settingHint || '').trim()
  if (hint.startsWith('Küche')) return 'kitchen'
  if (hint.startsWith('Wohnzimmer')) return 'living'
  if (hint.startsWith('Wohnungstür') || hint.startsWith('Tür')) return 'door'
  if (hint.startsWith('Draussen')) return 'street'
  return inferFilmPlaceKey(`${panel.imageCue || ''} ${panel.caption || ''} ${hint}`)
}

/**
 * Grundbild DIESES Ortes — Küchen-Weit nicht fürs Wohnzimmer,
 * Wohnzimmer-Weit nicht für die Küche.
 */
export function placeGrundbildPanel(
  board: FilmStoryboard,
  panel: FilmStoryboardPanel,
): FilmStoryboardPanel | undefined {
  const key = panelPlaceKey(panel)
  const wides = board.panels.filter(
    (p) => p.shot === 'wide' && Boolean(p.stillUrl?.startsWith('http')) && panelPlaceKey(p) === key,
  )
  return (
    wides.find((p) => p.sceneId === panel.sceneId && p.id !== panel.id) ||
    wides.find((p) => p.id !== panel.id)
  )
}

export function replaceStillUrl(
  board: FilmStoryboard,
  fromUrl: string,
  toUrl: string,
  sceneId?: string,
): FilmStoryboard {
  if (!fromUrl || fromUrl === toUrl) return normalizeFilmStoryboard(board)
  const next = normalizeFilmStoryboard(board)
  return {
    ...next,
    panels: next.panels.map((p) => {
      if (sceneId && p.sceneId !== sceneId) return p
      if (p.stillUrl !== fromUrl) return p
      return { ...p, stillUrl: toUrl, stillError: undefined }
    }),
    updatedAt: new Date().toISOString(),
  }
}

const SIDE_DE: Record<ReturnType<typeof seatSideFromX>, string> = {
  left: 'links',
  center: 'in der Mitte',
  right: 'rechts',
}

function isSittingPlacement(pl: Pick<FilmPlacement, 'poseId' | 'poseHint'>): boolean {
  return pl.poseId === 'sitting' || /sit/i.test(pl.poseHint || '')
}

/** Sitzplan für die KI: wer bleibt wo am Tisch. */
export function seatingLockEn(
  placements: Array<Pick<FilmPlacement, 'name' | 'x' | 'poseId' | 'poseHint'>>,
): string {
  const people = placements.filter((pl) => pl.name.trim())
  if (people.length === 0) return ''
  const bits = people.map((pl) => {
    const side = seatSideFromX(pl.x)
    return `${pl.name} ${isSittingPlacement(pl) ? 'sits' : 'stands'} on the ${side}`
  })
  return (
    `SEATING LOCK (180-degree rule): ${bits.join('; ')}. ` +
    `Everyone stays in that seat at this table unless the director fix explicitly stands them up. ` +
    `Do not move someone to a new room, a studio, or an empty chair. ` +
    `What is behind each person (wall, kitchen, window, table edge) stays as in the attached room photo.`
  )
}

export function seatingNoteDe(
  placements: Array<Pick<FilmPlacement, 'name' | 'x' | 'poseId' | 'poseHint'>>,
): string | null {
  const people = placements.filter((pl) => pl.name.trim())
  if (people.length === 0) return null
  return people
    .map((pl) => {
      const sit = isSittingPlacement(pl)
      return `${pl.name} ${sit ? 'sitzt' : 'steht'} ${SIDE_DE[seatSideFromX(pl.x)]}`
    })
    .join(', ')
}

export function gazeLockEn(speaker: string, addressee?: string, lookNote?: string): string {
  const who = speaker.trim() || 'the speaker'
  const to = addressee?.trim()
  const look = lookNote?.trim()
  const gaze = to
    ? `${who} looks at ${to} (conversation partner in this gathering), NOT at the camera.`
    : `${who} looks at their conversation partner in this gathering, NOT at the camera.`
  return `GAZE LOCK: ${gaze}${look ? ` Look/lighting: ${look}.` : ''}`
}

export function gazeNoteDe(speaker: string, addressee?: string, lookNote?: string): string | null {
  const who = speaker.trim()
  const to = addressee?.trim()
  const look = lookNote?.trim()
  if (who && to) return `${who} schaut ${to} an${look ? ` — ${look}` : ''}`
  if (look) return look
  return null
}

export function personNamedInCorrection(note: string | undefined, names: string[]): string | undefined {
  const t = (note || '').toLowerCase()
  if (!t) return undefined
  return names.find((n) => n.trim() && t.includes(n.trim().toLowerCase()))
}

/** Jean-Marie writes German without worrying about ä/ö/ü. */
export function foldCorrectionDe(note?: string): string {
  return (note || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
}

const RESTAGE_ALONE_RE =
  /\ballein(?:e|ig)?\b|\bnur\s+(?!ein\b|etwas\b|den\b|die\b|das\b|bisschen\b|wenig\b|noch\b|mal\b|ganz\b|leicht\b)[a-z]{3,}\b|\bkeine[nm]?\s+(?:anderen|leute|gaeste|personen|menschen|kinder)\b|\bohne\s+(?:gaeste|die\s+anderen|andere)\b|\bniemand\s+sonst\b|\bkein\s+gast\b|\bleere[rs]?\s+(?:zimmer|raum|kueche)\b/

const RESTAGE_REMOVE_RE =
  /\b(?:gaeste|leute|personen|kinder|die\s+anderen).{0,16}(?:raus|weg|entfernen)\b|\b(?:raus|weg|entfernen).{0,16}(?:gaeste|leute|personen|kinder|die\s+anderen)\b|\baus\s+dem\s+bild\b|\bnicht\s+mehr\s+im\s+bild\b|\b(?:raus|weg)\s*$/

const RESTAGE_PLACE_RE =
  /\bam\s+herd\b|\ban\s+der\s+spuele\b|\bbeim\s+herd\b|\bbeim\s+kessel\b|\bvor\s+dem\s+herd\b|\ban\s+der\s+theke\b|\bam\s+ofen\b|\ban\s+der\s+tuer\b|\bam\s+waschbecken\b|\bam\s+fenster\b|\bweg\s+vom\s+tisch\b|\bnicht\s+am\s+tisch\b|\ban\s+der\s+spuele\b/

const RESTAGE_STAND_AT_RE =
  /\b(?:steht|stehen|sitzt|sitzen)\s+(?:am|an|bei|vor|hinter|neben)\b|\b(?:am|an|bei)\s+\w+\s+(?:steht|stehen|sitzt|sitzen)\b/

/**
 * «mach dass ramo alleine am Herd steht» is a new shot, not a pixel tweak
 * of the old table still.
 */
export function correctionRestagesBlocking(note?: string): boolean {
  const raw = (note || '').trim()
  if (!raw) return false
  if (correctionIsFaceOnly(raw) || correctionRewritesPerson(raw)) return false
  const t = foldCorrectionDe(raw)
  return (
    RESTAGE_ALONE_RE.test(t) ||
    RESTAGE_REMOVE_RE.test(t) ||
    RESTAGE_PLACE_RE.test(t) ||
    RESTAGE_STAND_AT_RE.test(t)
  )
}

/** Who stays in frame after a restage hint. Alone → only the named person. */
export function peopleKeptInRestage(note: string | undefined, names: string[]): string[] {
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  if (!clean.length) return []
  const t = foldCorrectionDe(note)
  const named = clean.filter((n) => (note || '').toLowerCase().includes(n.trim().toLowerCase()))
  if (RESTAGE_ALONE_RE.test(t)) return named.length ? named : clean.slice(0, 1)
  if (RESTAGE_REMOVE_RE.test(t) && named.length) {
    const drop = new Set(named.map((n) => n.toLowerCase()))
    const kept = clean.filter((n) => !drop.has(n.toLowerCase()))
    return kept.length ? kept : named
  }
  if (named.length && (RESTAGE_PLACE_RE.test(t) || RESTAGE_STAND_AT_RE.test(t))) return named
  if (RESTAGE_PLACE_RE.test(t) || RESTAGE_STAND_AT_RE.test(t)) return clean.slice(0, 1)
  return named.length ? named : clean
}

export function applyRestageToPanel(
  panel: FilmStoryboardPanel,
  correction: string,
  candidateNames?: string[],
): FilmStoryboardPanel {
  const names = candidateNames?.length
    ? candidateNames
    : panel.placements.map((pl) => pl.name)
  const keep = new Set(
    peopleKeptInRestage(correction, names).map((n) => n.trim().toLowerCase()),
  )
  const folded = foldCorrectionDe(correction)
  const standing =
    /\b(steht|stehen|stehend)\b/.test(folded) && !/\b(sitzt|sitzen|sitzend)\b/.test(folded)
  const kitchenish = /herd|spuele|kessel|kueche|ofen/.test(folded)
  const filtered = panel.placements.filter((pl) => keep.has(pl.name.trim().toLowerCase()))
  const source = filtered.length ? filtered : panel.placements.slice(0, 1)
  const placements = source.map((pl) =>
    standing
      ? {
          ...pl,
          poseId: 'standing-front' as const,
          poseHint: pl.poseHint?.includes('steht') ? pl.poseHint : 'steht',
        }
      : pl,
  )
  const people = placements.map((pl) => pl.name.trim()).filter(Boolean)
  const refNeeds = panel.refNeeds
    ? {
        ...panel.refNeeds,
        people: (panel.refNeeds.people ?? []).filter((n) => keep.has(n.trim().toLowerCase())),
      }
    : people.length
      ? { people, places: [] as string[], propIds: panel.propIds ?? [] }
      : panel.refNeeds
  return {
    ...panel,
    placements,
    refNeeds,
    settingHint: kitchenish ? settingHintForPlace('kitchen') : panel.settingHint,
    stillCorrection: correction,
    directorNote: correction,
  }
}

export function castIdentityLockEn(opts: {
  names: string[]
  genders: Record<string, 'male' | 'female' | undefined>
  stillCorrection?: string
  restage?: boolean
}): string {
  const names = opts.names.filter(Boolean)
  if (names.length === 0) return ''
  const rewrite = correctionRewritesPerson(opts.stillCorrection)
  const restage = Boolean(opts.restage) || correctionRestagesBlocking(opts.stillCorrection)
  const changed = personNamedInCorrection(opts.stillCorrection, names)
  const bits = names.map((name) => {
    const g = opts.genders[name]
    const sex =
      g === 'male' ? 'male' : g === 'female' ? 'female' : 'the same sex as in the attached identity plate'
    const changing = rewrite && changed && name.trim().toLowerCase() === changed.trim().toLowerCase()
    if (changing) {
      return `${name} is ${sex} AFTER the director fix (face/sex may change; they stay the same person)`
    }
    if (restage) {
      return `${name} is ${sex} — same face and clothes as the PERSON identity plate, in the NEW blocking`
    }
    return `${name} is ${sex} — same person throughout this scene, same face as in the attached room photo`
  })
  const looks = rewrite
    ? []
    : names
        .map((n) => lookForCharacterName(n)?.identityLock)
        .filter((s): s is string => Boolean(s))
  return `CAST LOCK: ${bits.join('. ')}. ${
    restage
      ? 'Only these named people appear. Do not paint extra guests. Identity plates are faces and clothes, not the old seating chart.'
      : rewrite
        ? 'Only the named person in the director fix may change sex/face. Everyone else stays the same people in the same seats.'
        : 'Keep these exact identities. Do not swap faces.'
  }${looks.length ? ` ${looks.join(' ')}` : ''}`
}

export function sceneContinuityBlock(opts: {
  placements?: Array<Pick<FilmPlacement, 'name' | 'x' | 'poseId' | 'poseHint'>>
  speaker?: string
  addressee?: string
  lookNote?: string
  genders?: Record<string, 'male' | 'female' | undefined>
  stillCorrection?: string
  hasGrundbild?: boolean
  restage?: boolean
}): string {
  const restage = Boolean(opts.restage) || correctionRestagesBlocking(opts.stillCorrection)
  const placements = opts.placements ?? []
  const names = [...new Set(placements.map((pl) => pl.name.trim()).filter(Boolean))]
  if (restage) {
    const who = names.length ? names.join(', ') : opts.speaker || 'the named person'
    const stove =
      inferFilmPlaceKey(`${opts.stillCorrection || ''} ${who}`) === 'kitchen' ||
      /herd|spuele|kessel|kueche/.test(foldCorrectionDe(opts.stillCorrection))
        ? 'Keep the SAME kettle and SAME stove type (gas stays gas, induction stays induction). '
        : ''
    return [
      `RESTAGE: The previous blocking is WRONG. Paint a NEW camera and NEW staging from the German line and the director hint. Do not copy the old seated gathering. Do not treat the hint as a caption on the old still.`,
      `People in this new shot: ${who} only. FORBIDDEN: extra guests, unnamed people, twins.`,
      stove,
      castIdentityLockEn({
        names,
        genders: opts.genders ?? {},
        stillCorrection: opts.stillCorrection,
        restage: true,
      }),
    ]
      .filter(Boolean)
      .join(' ')
  }
  const ground = opts.hasGrundbild
    ? 'GROUNDBILD: The attached room photo is THIS scene. Same table, same furniture, same people in the same seats. Do not invent a new location.'
    : ''
  return [
    ground,
    seatingLockEn(placements),
    gazeLockEn(opts.speaker || '', opts.addressee, opts.lookNote),
    castIdentityLockEn({
      names,
      genders: opts.genders ?? {},
      stillCorrection: opts.stillCorrection,
    }),
  ]
    .filter(Boolean)
    .join(' ')
}

export function referenceUrlsForPanel(
  panel: FilmStoryboardPanel,
  _previousStillUrl?: string,
  correctFromUrl?: string,
  sceneWideStillUrl?: string,
): string[] {
  const people: string[] = []
  for (const pl of panel.placements) {
    if (pl.imageUrl) people.push(pl.imageUrl)
  }
  const bg =
    panel.background.imageUrl && panel.background.match !== 'missing'
      ? panel.background.imageUrl
      : undefined
  const closeup = panel.shot === 'closeup'
  const insert = panel.shot === 'insert'
  const http = (u?: string): u is string => Boolean(u && u.startsWith('http'))
  const speakerId = closeup ? speakerIdentityUrl(panel) : undefined
  const ordered = (
    correctFromUrl
      ? [correctFromUrl, sceneWideStillUrl, speakerId]
      : closeup
        ? [sceneWideStillUrl, speakerId]
        : insert
          ? [...people]
          : [bg, ...people]
  ).filter(http)
  return [...new Set(ordered)].slice(0, closeup ? 3 : 4)
}

export type StillRefRole = 'grundbild' | 'place' | 'person' | 'identity' | 'prop'

export type StillRefItem = { role: StillRefRole; name: string; url: string; propId?: string }

export function panelPropIds(panel: FilmStoryboardPanel): string[] {
  return uniqueStable([
    ...(panel.refNeeds?.propIds ?? []),
    ...(panel.propIds ?? []),
    ...inferPropIdsFromText(`${panel.caption || ''} ${panel.imageCue || ''} ${panel.settingHint || ''}`),
  ])
}

/**
 * Letztes gemaltes Bild, in dem DIESE Sache sichtbar war —
 * dieselben Blumen, dieselbe Kanne; nicht ein beliebiges Weit-Bild ohne den Gegenstand.
 */
export function previousPropStillUrl(
  board: FilmStoryboard,
  panel: FilmStoryboardPanel,
  propId: string,
): string | undefined {
  const want = propId.trim().toLowerCase()
  if (!want) return undefined
  const all = normalizeFilmStoryboard(board).panels
  const idx = all.findIndex((p) => p.id === panel.id)
  const search = idx >= 0 ? all.slice(0, idx) : all.filter((p) => p.id !== panel.id)
  for (let i = search.length - 1; i >= 0; i--) {
    const prev = search[i]
    if (!prev?.stillUrl?.startsWith('http')) continue
    const ids = panelPropIds(prev)
    if (ids.includes(want)) return prev.stillUrl
  }
  return undefined
}

/** Restage: Kanne/Herd from ANY other still, not the current table composition. */
export function otherPropStillUrl(
  board: FilmStoryboard,
  panel: FilmStoryboardPanel,
  propId: string,
): string | undefined {
  const want = propId.trim().toLowerCase()
  if (!want) return undefined
  const all = normalizeFilmStoryboard(board).panels
  for (const other of all) {
    if (other.id === panel.id) continue
    if (!other.stillUrl?.startsWith('http')) continue
    if (other.stillUrl === panel.stillUrl) continue
    if (panelPropIds(other).includes(want)) return other.stillUrl
  }
  return undefined
}

/**
 * Welche Vorlagen die Bild-KI bekommt: Raum dieses Ortes, Stammbilder der Figuren,
 * Grundbild nur wenn es derselbe Ort ist.
 */
export function stillReferencePack(
  panel: FilmStoryboardPanel,
  opts?: {
    previousStillUrl?: string
    correctFromUrl?: string
    sceneWideStillUrl?: string
    board?: FilmStoryboard
    inventory?: FilmInventory | null
    restage?: boolean
  },
): { urls: string[]; items: StillRefItem[]; instruction: string; noteDe: string } {
  const http = (u?: string): u is string => Boolean(u && u.startsWith('http'))
  const place = panelPlaceKey(panel)
  const closeup = panel.shot === 'closeup'
  const insert = panel.shot === 'insert'
  const restage =
    Boolean(opts?.restage) || correctionRestagesBlocking(panel.stillCorrection)
  const placeWide =
    opts?.board ? placeGrundbildPanel(opts.board, panel)?.stillUrl : undefined
  const wideUrl = placeWide || opts?.sceneWideStillUrl
  const widePlaceOk =
    !wideUrl ||
    !opts?.board ||
    panelPlaceKey(
      opts.board.panels.find((p) => p.stillUrl === wideUrl) ?? panel,
    ) === place ||
    place === 'other'
  const safeWide = widePlaceOk ? wideUrl : undefined
  const bg =
    panel.background.imageUrl && panel.background.match !== 'missing'
      ? panel.background.imageUrl
      : undefined
  const items: StillRefItem[] = []
  const add = (item: StillRefItem) => {
    if (!http(item.url) || items.some((x) => x.url === item.url)) return
    items.push(item)
  }

  const wantedPeople = new Set(
    (panel.refNeeds?.people ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean),
  )
  const wantedPlaces = new Set(
    (panel.refNeeds?.places ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean),
  )
  const propIds = panelPropIds(panel)
  const propUrls = new Set<string>()
  if (opts?.board) {
    for (const propId of propIds) {
      const url: string | undefined =
        previousPropStillUrl(opts.board, panel, propId) ||
        (restage ? otherPropStillUrl(opts.board, panel, propId) : undefined)
      if (!url || url === panel.stillUrl || url === opts?.correctFromUrl) continue
      propUrls.add(url)
      add({
        role: 'prop',
        name: propLabelDe(propId, opts?.inventory),
        url,
        propId,
      })
    }
  }

  const correcting = Boolean(opts?.correctFromUrl) && !restage
  if (opts?.correctFromUrl && !restage) {
    add({ role: 'grundbild', name: 'aktuelles Bild', url: opts.correctFromUrl })
  }
  if (closeup && safeWide && !restage) {
    add({ role: 'grundbild', name: placeLabelDe(place), url: safeWide })
  }
  const prevPlace =
    (opts?.board ? previousPlaceStillUrl(opts.board, panel) : undefined) || opts?.previousStillUrl
  const wantsThisPlace = !wantedPlaces.size || wantedPlaces.has(place)
  const prevIsCurrent =
    prevPlace === panel.stillUrl || prevPlace === opts?.correctFromUrl
  const wantPrevPlace =
    (insert || ((correcting || restage) && !closeup)) &&
    Boolean(prevPlace) &&
    wantsThisPlace &&
    !propUrls.has(prevPlace || '') &&
    !(restage && prevIsCurrent)
  if (wantPrevPlace && prevPlace) {
    add({
      role: restage ? 'place' : 'grundbild',
      name: `vorige ${placeLabelDe(place)}`,
      url: prevPlace,
    })
  }
  if (!closeup && !insert && bg && wantsThisPlace) {
    add({ role: 'place', name: placeLabelDe(place), url: bg })
  }
  if (insert && bg && !prevPlace && wantsThisPlace) {
    add({ role: 'place', name: placeLabelDe(place), url: bg })
  }
  const speakerId = closeup ? speakerIdentityUrl(panel) : undefined
  if (speakerId) {
    add({
      role: 'identity',
      name: panel.closeupSpeaker?.trim() || 'Sprecher',
      url: speakerId,
    })
  }
  if (!closeup || restage) {
    for (const pl of panel.placements) {
      const name = pl.name.trim() || 'Figur'
      if (wantedPeople.size && !wantedPeople.has(name.toLowerCase())) continue
      if (pl.imageUrl) add({ role: 'person', name, url: pl.imageUrl })
    }
  }

  const max = closeup && !restage ? 3 : 4
  const rank = (it: StillRefItem): number => {
    if (restage) {
      if (it.role === 'prop') return 0
      if (it.role === 'person' || it.role === 'identity') return 1
      if (it.role === 'place') return 2
      return 3
    }
    if (it.role === 'grundbild' && it.url === opts?.correctFromUrl) return 0
    if (it.role === 'prop') return 1
    if (it.role === 'place' || it.role === 'grundbild') return 2
    return 3
  }
  const ranked = [...items].sort((a, b) => rank(a) - rank(b))
  const clipped: StillRefItem[] = []
  for (const it of ranked) {
    if (clipped.length >= max) break
    if (clipped.some((x) => x.url === it.url)) continue
    clipped.push(it)
  }
  const labels = clipped.map((it, i) => {
    if (it.role === 'prop') {
      const what = propLabelEn(it.propId || it.name, opts?.inventory)
      return restage
        ? `${i + 1}. PROP identity: the SAME ${what} as in this photo (shape, color, handle). Do NOT copy the people or seating from this photo.`
        : `${i + 1}. PROP: the SAME ${what} as in this photo — do not invent a new one.`
    }
    if (it.role === 'grundbild') {
      if (it.url === opts?.correctFromUrl) {
        return `${i + 1}. GROUNDBILD / CURRENT still to correct — apply the director fix. Keep these EXACT people unless the fix says otherwise.`
      }
      if (restage) {
        return `${i + 1}. PLACE identity of the ${placeLabelEn(place)} — SAME furniture and named objects${place === 'kitchen' ? ', SAME stove type (gas stays gas, induction stays induction)' : ''}. The OLD blocking in this photo is WRONG. Do NOT copy who sits where.`
      }
      return insert
        ? `${i + 1}. PREVIOUS still of the SAME ${placeLabelEn(place)} — same named objects, same furniture${place === 'kitchen' ? ', same stove type (gas stays gas, induction stays induction)' : ''}. New action only. NOT a different room.`
        : `${i + 1}. GROUNDBILD of the ${placeLabelEn(place)} only — same furniture, same people. NOT a different room.`
    }
    if (it.role === 'place') {
      return restage
        ? `${i + 1}. PLACE identity: ${placeLabelEn(place)} — furniture and room only${place === 'kitchen' ? ', SAME stove type (gas stays gas, induction stays induction)' : ''}. Ignore any people in this photo. The old blocking is WRONG.`
        : `${i + 1}. PLACE photo: ${placeLabelEn(place)} empty room. Kitchen photos only for kitchen, living-room photos only for living room.`
    }
    if (it.role === 'identity') {
      return `${i + 1}. PERSON / IDENTITY plate of ${it.name} — this exact face and clothes, same sex.`
    }
    return `${i + 1}. PERSON identity of ${it.name} — this exact face and clothes, same sex. Never swap with another guest.`
  })
  const instruction = labels.length
    ? restage
      ? `RESTAGE, not a pixel tweak. Attached photos in order: ${labels.join(' | ')} Use each photo only for identity (face, clothes, room, props). The OLD gathering/blocking is WRONG — do not copy who sits where. Do not paint extra guests. PROP photos lock THAT object: the SAME kettle stays that kettle. If a kitchen still is attached: same stove type (gas stays gas, induction stays induction).`
      : `Attached photos in order: ${labels.join(' | ')} Use each photo only for that role. Do not mix rooms. PROP photos lock THAT object: paint the SAME object as in the PROP photo (flowers stay those flowers, a kettle stays that kettle) — do not invent a replacement. If a kitchen still is attached: same stove type (gas stays gas, induction stays induction).`
    : ''
  const noteDe = clipped.length
    ? `Mitgeschickt: ${clipped
        .map((it) => (it.role === 'prop' ? `${it.name} (dieselbe)` : it.name))
        .join(', ')}.`
    : 'Keine Vorlage mitgeschickt.'
  return { urls: clipped.map((it) => it.url), items: clipped, instruction, noteDe }
}

/** Stammbild der sprechenden Person — Gesicht und Kleidung der Nahaufnahme. */
export function speakerIdentityUrl(panel: FilmStoryboardPanel): string | undefined {
  const who = panel.closeupSpeaker?.trim().toLowerCase()
  if (!who) return undefined
  const hit = panel.placements.find(
    (p) => p.name.trim().toLowerCase() === who && p.imageUrl?.startsWith('http'),
  )
  return hit?.imageUrl
}

export function previousStillUrlInScene(
  board: FilmStoryboard,
  panel: FilmStoryboardPanel,
): string | undefined {
  const same = panelsForScene(board, panel.sceneId)
  const idx = same.findIndex((p) => p.id === panel.id)
  for (let i = idx - 1; i >= 0; i--) {
    if (same[i]?.stillUrl) return same[i]!.stillUrl
  }
  return undefined
}

/**
 * Letztes gemaltes Bild DIESES Ortes — Küchen-Insert bekommt die vorige Kanne,
 * nicht das Wohnzimmer und nicht die leere Bibliotheks-Küche.
 */
export function previousPlaceStillUrl(
  board: FilmStoryboard,
  panel: FilmStoryboardPanel,
): string | undefined {
  const key = panelPlaceKey(panel)
  const all = normalizeFilmStoryboard(board).panels
  const idx = all.findIndex((p) => p.id === panel.id)
  const search = idx >= 0 ? all.slice(0, idx) : all.filter((p) => p.id !== panel.id)
  for (let i = search.length - 1; i >= 0; i--) {
    const prev = search[i]
    if (!prev?.stillUrl?.startsWith('http')) continue
    if (panelPlaceKey(prev) === key) return prev.stillUrl
  }
  return undefined
}

export function applyPanelStill(
  board: FilmStoryboard,
  panelId: string,
  stillUrl: string,
  styleId: string,
): FilmStoryboard {
  const next = normalizeFilmStoryboard(board)
  return {
    ...next,
    panels: next.panels.map((p) =>
      p.id === panelId
        ? {
            ...p,
            stillUrl,
            stillStyleId: styleId,
            stillError: undefined,
            harvestNoteDe: undefined,
          }
        : p,
    ),
    updatedAt: new Date().toISOString(),
  }
}

export function applyPanelStillError(
  board: FilmStoryboard,
  panelId: string,
  stillError: string,
): FilmStoryboard {
  const next = normalizeFilmStoryboard(board)
  return {
    ...next,
    panels: next.panels.map((p) => (p.id === panelId ? { ...p, stillError } : p)),
    updatedAt: new Date().toISOString(),
  }
}

/** «Schöme ist ein Mann» — Gesicht neu, Raum behalten. */
export function correctionRewritesPerson(note?: string): boolean {
  const t = (note || '').toLowerCase()
  if (!t) return false
  return /mann|junge|männlich|frau|mädchen|weiblich|\bman\b|\bboy\b|\bgirl\b|gesicht|andere person|ist ein/.test(
    t,
  )
}

export function genderFromPictureNote(note?: string): 'male' | 'female' | undefined {
  const t = (note || '').toLowerCase()
  if (/mann|junge|männlich|\bboy\b|\bmale\b|kein mädchen/.test(t)) return 'male'
  if (/frau|mädchen|weiblich|\bgirl\b|\bfemale\b/.test(t)) return 'female'
  return undefined
}

/** Vorlage für «Bild neu malen»: bei Geschlechtswechsel die Übersicht, nicht das Mädchen-Porträt. */
export function correctFromUrlForPanel(
  board: FilmStoryboard,
  panel: FilmStoryboardPanel,
  correction?: string,
): string | undefined {
  const note = correction?.trim()
  if (!note) return undefined
  if (correctionRestagesBlocking(note)) return undefined
  if (correctionRewritesPerson(note)) {
    return sceneGrundbildPanel(board, panel.sceneId)?.stillUrl || panel.stillUrl
  }
  return panel.stillUrl
}

/** Was an den angehängten Fotos steht — Gesicht nicht einfrieren, wenn die Person neu soll. */
export function stillAttachmentInstruction(opts: {
  correctingExisting: boolean
  closeup: boolean
  insert?: boolean
  rewritePerson?: boolean
  packInstruction?: string
  restage?: boolean
}): string {
  const pack = opts.packInstruction?.trim() ? `${opts.packInstruction.trim()} ` : ''
  if (opts.restage) {
    return `${pack}RESTAGE: attached photos are IDENTITY only (face, clothes, room, props). The OLD blocking is WRONG — do not copy who sits where, do not keep extra guests from an old table scene. Paint a NEW camera and NEW staging from the director restage and the German line. If the restage says alone / no other people, paint ZERO extra guests. Keep the SAME kettle and SAME stove type (gas stays gas, induction stays induction) when those objects apply. Do NOT treat the restage as a caption over the old still.`
  }
  if (opts.insert) {
    const current = opts.correctingExisting
      ? 'Also attached: CURRENT still to correct. Keep these EXACT people (face, hair, clothes) unless the director fix says otherwise. Apply only the director fix. '
      : ''
    return `${pack}${current}If a PROP photo is attached, paint the SAME object as in that photo (flowers stay those flowers, a kettle stays that kettle, a coat stays that coat) — do not invent a new one. If a GROUNDBILD / previous still of this place is attached, keep that SAME room and the SAME named objects${opts.insert ? '; in a kitchen, SAME stove type (gas stays gas, induction stays induction)' : ''}. Paint the NEW named action. Identity plates are PERSON faces only — each face ONCE, never twins. Do NOT copy the wide group photo. Do NOT invent a replacement object. Fill the frame with the named detail. CAMERA at standing-adult eye level — never only feet.`
  }
  if (opts.rewritePerson && opts.closeup) {
    return `${pack}Attached photos: FIRST the WIDE GROUNDBILD of everyone at the table. Optional second photo: identity plate of the speaker. Paint a TIGHT head-and-shoulders of that speaker still sitting in the gathering. Do not empty the room. Do not paste a giant face over the group. Sex and face may change as the director fix says. Do not keep a wrong-gender face.`
  }
  if (opts.rewritePerson) {
    return `${pack}Attached photos: first the GROUNDBILD of this room. Keep that same room, furniture, camera and seating. Everyone stays at this table. Redraw only the named person as the director fix says (sex and face may change). Do not keep a wrong-gender face. Do not copy a girl face onto a boy or a boy face onto a girl. Do not invent a new location.`
  }
  if (opts.correctingExisting) {
    return `${pack}Attached photos: the CURRENT still to correct (keep these EXACT people: face, hair, clothes, unless the director fix says otherwise). Also previous stills of this PLACE, PROP photos, PLACE photos and PERSON/IDENTITY plates when attached — labeled GROUNDBILD / PROP / PLACE / PERSON. Use each only for that role. Apply only the director fix. CAMERA at eye level — never only feet.`
  }
  if (opts.closeup) {
    return `${pack}Attached photos: FIRST the WIDE GROUNDBILD of THIS same room. Optional second photo: identity plate (this speaker’s face and clothes). Output a TIGHT head-and-shoulders of that same person still sitting in that gathering. Neighbours may be cut by the frame edge. Do NOT empty the room into a vacant set. Do NOT paste a giant bust over the group photo. Do NOT copy a cropped screenshot. Same clothes as the wide. The speaker stays this person — never use another guest’s close-up.`
  }
  return `${pack}Attached photos: first the EMPTY ROOM matching THIS place only (complete furniture, no people). Then COMPLETE people as full studio figures. Paint them INTO that one room — kitchen photos stay kitchen, living-room photos stay living room. Never collage both rooms. One coherent picture.`
}

/** Nur Mimik auf einer bestehenden Nahaufnahme — sonst neu filmen, nicht den Ausschnitt behalten. */
export function correctionIsFaceOnly(note?: string): boolean {
  const t = (note || '').toLowerCase()
  if (!t || correctionRewritesPerson(t)) return false
  return /mund|lächel|mimik|augenbrau|lid|facial|weint|freut|zorn|überrascht/.test(t)
}

function insertCameraHeightEn(cue: string): string {
  const blob = cue.toLowerCase()
  const place = inferFilmPlaceKey(cue)
  const kitchenish =
    place === 'kitchen' ||
    /kessel|spüle|spuele|herd|sink|stove|kettle|kanne|tee|wasserhahn/.test(blob)
  const doorish =
    place === 'door' || /tür|tuer|door|klopf|klingel|schloss|lock|riegel|klinke/.test(blob)
  if (doorish) {
    return (
      `CAMERA: standing adult at eye level, from INSIDE the apartment looking at the door. ` +
      `The door fills the frame at HAND and FACE height. ` +
      `Lock, handle and peephole sit at normal door height about 1.0–1.2 metres from the floor. ` +
      `Never a lock lying on the floor. Never a shot of only feet or shoes.`
    )
  }
  if (kitchenish) {
    return (
      `CAMERA: standing adult at eye level in the kitchen. ` +
      `Kettle, sink, stove and tap at standing work height (waist to chest). ` +
      `Never a shot of feet or shoes under the counter.`
    )
  }
  return (
    `CAMERA: standing adult at eye level. ` +
    `Named objects at their normal height in the room (door hardware at door height, kitchen tools at the counter).`
  )
}

/** Zwischenbild = Detail auf Augenhöhe, nicht der ganze Raum und nicht der Boden. */
export function insertCameraLine(cue?: string): string {
  const what = (cue || 'the named detail').trim()
  return (
    `INSERT / cutaway: fill the frame with this detail — ${what}. ` +
    `Not a wide of the whole room, not a talking-head close-up. ` +
    `Same house and lighting as this scene. ${insertCameraHeightEn(what)} ` +
    `Camera close to the named detail but still at standing-adult eye level — never a ground-level or worm's-eye camera. ` +
    `Paint each named person ONCE. Never twins, never two copies of the same face. ` +
    `If one person fills a kettle or pours tea, paint exactly that one person — not two copies doing the same action. ` +
    `If a PROP photo is attached: PROP LOCK — the SAME object as in that photo (whatever was attached: flowers, coat, newspaper, kettle), do not invent a new one. ` +
    `If a previous kitchen still is attached: SAME named kitchen objects, SAME stove (gas stays gas, induction stays induction). ` +
    `Water goes into the kettle at the sink BEFORE the kettle sits on the stove. ` +
    `FORBIDDEN: copying the previous living-room photo. ` +
    `FORBIDDEN: everyone sitting around the table unless the cue names that gathering. ` +
    `FORBIDDEN: an extra guest who is not named in this frame. ` +
    `FORBIDDEN: ground-level camera. ` +
    `FORBIDDEN: only feet or shoes in frame. ` +
    `FORBIDDEN: the named object lying on the floor unless the cue names the floor.`
  )
}

/** Nahaufnahme = Kamera näher, kein zerschnittener Weit-Shot. */
export function closeupCameraLine(speaker?: string): string {
  const who = speaker?.trim() || 'the speaker'
  return (
    `CAMERA PUSH-IN close-up of ${who}: stand much closer, eye level, still in the SAME occupied gathering. ` +
    `Head and shoulders fill most of the frame (about 50–70%). Only a SLICE of the same room behind them ` +
    `(one window pane, one plant, table edge) — not the whole living room. ` +
    `They stay seated with the others. Tea, cushions, maybe a neighbour’s shoulder at the frame edge. ` +
    `Same face, hair and clothes as this person in the wide photo. ` +
    `FORBIDDEN: a giant face pasted in front of the group. FORBIDDEN: an empty room with only this portrait. ` +
    `FORBIDDEN: a cropped screenshot of the wide photo. ` +
    `FORBIDDEN: only turning their head toward the lens while the camera stays in the original wide place. ` +
    `Paint one coherent closer shot from a new camera position.`
  )
}

/** Nahaufnahme: gleiches Geschlecht wie Übersicht/Stammbild — nicht aus dem Namen raten. */
export function closeupGenderLine(gender?: 'male' | 'female'): string {
  if (gender === 'male') {
    return 'This speaker is male. Keep a male face — do not redraw as a girl.'
  }
  if (gender === 'female') {
    return 'This speaker is female. Keep a female face — do not redraw as a boy.'
  }
  return 'Keep the same sex as in the wide still and identity plate. Do not guess a different gender from the name. Do not change a boy into a girl or a girl into a boy.'
}

export function buildFilmStillPrompt(opts: {
  caption: string
  imageCue?: string
  settingHint?: string
  expressionHint?: string
  sceneTitle?: string
  styleId?: string
  names?: string[]
  poseHints?: string[]
  hasLibraryRefs: boolean
  targetLanguage?: string
  directorNote?: string
  stillCorrection?: string
  correctingExisting?: boolean
  spokenLine?: string
  beatIndex?: number
  beatTotal?: number
  shot?: 'wide' | 'closeup' | 'insert'
  closeupSpeaker?: string
  speakerGender?: 'male' | 'female'
  speakerX?: number
  continuityEn?: string
  restage?: boolean
}): string {
  const style = getStoryStylePrompt(opts.styleId)
  const styleLabel = getStoryArtStyle(opts.styleId).label
  const people = (opts.names ?? []).filter(Boolean).join(', ')
  const poses = (opts.poseHints ?? []).filter(Boolean).join('; ')
  const langEn = filmStillLanguageEn(opts.targetLanguage)
  const isCloseup = opts.shot === 'closeup'
  const isInsert = opts.shot === 'insert'
  const rewritePerson = correctionRewritesPerson(opts.stillCorrection)
  const restage = Boolean(opts.restage) || correctionRestagesBlocking(opts.stillCorrection)
  const closeEyes =
    'Eyes fully drawn and opaque: white sclera, colored iris, dark pupil — never translucent, glassy, hollow, see-through, or empty-white.'
  const lock = restage
    ? `${STORY_STILLS_LOCK_PROMPT} RESTAGE identity: faces and clothes of the NAMED people only. PROP LOCK: the SAME kettle as in a PROP photo, SAME stove type (gas stays gas, induction stays induction). Paint NEW blocking from the director restage. Do not copy a previous gathering. Do not invent extra guests. ${closeEyes}`
    : rewritePerson
    ? `${closeEyes} ${closeupGenderLine(opts.speakerGender)} Keep the same room, the same table and the same seats. The speaker stays sitting with the others. Redraw only that person as the director fix says. Do not keep a wrong-gender face. Do not stand them up or move them to a studio.`
    : opts.hasLibraryRefs
    ? isCloseup
      ? `${STORY_STILLS_LOCK_PROMPT} If a WIDE group photo is attached, CAMERA PUSH-IN: tight head-and-shoulders of THAT person still sitting in the gathering. Same seat, same clothes, same face. The others are still at the table (maybe only a shoulder in frame). Not a cropped screenshot, not a giant bust overlaid on the group, not an emptied room. ${closeEyes} ${closeupGenderLine(opts.speakerGender)} Not a new studio portrait, not a cut-out sprite, not a floating bust.`
      : isInsert
        ? `${STORY_STILLS_LOCK_PROMPT} PROP LOCK: if a PROP photo is attached, paint the SAME object as in that photo (flowers stay those flowers, a kettle stays that kettle) — do not invent a new one. If a previous still of THIS place is attached, keep that SAME room and the SAME named objects. Identity plates are faces only. Paint each named person ONCE. Never twins. Paint a NEW insert of the named detail. Do not copy the wide gathering. Do not collage.`
        : `${STORY_STILLS_LOCK_PROMPT} PROP LOCK: if a PROP photo is attached, the SAME object as in that photo must appear — do not invent a new one. Attached photos are identity plates, not stickers: first an EMPTY ROOM with complete furniture matching the place description (not a generic unused living room); then COMPLETE people. Paint a NEW coherent illustration of those people living INSIDE a room that matches the DIALOGUE setting (cushions, table, carpets as described). Sit them IN the real furniture. Do not copy a previous living room. Do not collage or paste sprites.`
    : isCloseup
      ? `Paint a close-up by zooming into the same person in the same room: face fills the frame, mouth and eyebrows readable, head and shoulders, hair not cropped off. ${closeEyes} ${closeupGenderLine(opts.speakerGender)} Same table/seat still readable. No cut-out, no full body, no studio backdrop.`
      : isInsert
        ? 'Paint a cinematic insert: the named object or small action fills the frame. Same house, not a wide of the whole room.'
        : 'Draw a complete room matching the described place (not a leftover generic living room), with complete furniture and complete people occupying it.'
  const notGerman =
    opts.targetLanguage && opts.targetLanguage.slice(0, 2).toLowerCase() !== 'de'
      ? `Never write German on signs, stalls, posters or paper (no Bratwurst, Glühwein, German menus). Use ${langEn} instead (e.g. French: saucisse, vin chaud).`
      : ''
  const moment =
    opts.beatIndex && opts.beatTotal
      ? `This is moment ${opts.beatIndex} of ${opts.beatTotal}.`
      : opts.beatIndex
        ? `This is moment ${opts.beatIndex} of a sequence.`
        : 'This is one moment in a sequence.'

  return [
    `FINISHED cinematic STILL FRAME for a storyboard. Not a moving film, not animation, not a rough pencil sketch.`,
    restage
      ? `NEW SHOT / RESTAGE. New camera, new blocking from the director restage and the German line. FORBIDDEN: copying the previous seated gathering. FORBIDDEN: extra guests not named in the restage. If the restage says alone / no other people, paint ZERO extra people — only the named person. Do not treat the restage as a caption over the old still.`
      : isCloseup
      ? `${closeupCameraLine(opts.closeupSpeaker)} Camera at eye level, face large (about 50–70% of the frame), head and shoulders, top of hair inside the frame. Mouth mid-speech, eyebrows readable. ${
          rewritePerson
            ? 'New correct face and sex. Do not keep a wrong-gender face from the attached photo.'
            : 'Same face as in the wide gathering.'
        }`
      : isInsert
        ? insertCameraLine(opts.imageCue || opts.caption)
        : rewritePerson
        ? `WIDE shot of the SAME gathering. Keep this camera, this table and these seats. Apply the director fix to the named person only. Everyone else stays where they are. Sitting people stay sitting, hips on the seat.`
        : `WIDE shot. Paint ONE coherent illustration of a complete room filled with complete furniture matching THIS scene's description, and complete figures. The people belong in the room. Do not reuse a previous unrelated living room. Do not collage, no cut-out sprites, no dashed boxes, no ghost people. FORBIDDEN: an empty room with no guests if people are named.`,
    restage
      ? `${moment} This frame MUST NOT copy the previous still's composition. New place-in-the-room, new who-is-in-frame.`
      : opts.correctingExisting
      ? ''
      : isCloseup
        ? `${moment} Same gathering and clothes as the wide still. Only the camera is closer — do not invent a new room or a new person.`
        : isInsert
          ? `${moment} New camera on the named detail. Never copy the previous wide frame.`
          : `${moment} It MUST look different from other frames: who speaks, what they hold, gaze, pose or camera. Never copy the previous frame.`,
    `Art style (${styleLabel}): ${style}`,
    placeLockEn(
      inferFilmPlaceKey(
        `${opts.settingHint || ''} ${opts.imageCue || ''} ${opts.caption || ''} ${opts.stillCorrection || ''}`,
      ),
    ),
    teaBeatLockEn(opts.caption, opts.imageCue || opts.stillCorrection),
    opts.continuityEn || '',
    lock,
    restage
      ? 'Do not keep the old seating chart. Ignore who sat where in any attached photo.'
      : isCloseup
      ? closeupSpaceLine({
          speaker: opts.closeupSpeaker || '',
          settingHint: opts.settingHint,
          speakerX: opts.speakerX,
          poseHint: poses,
        })
      : isInsert
        ? 'Do not keep the seating chart of the wide shot. Show only what the insert names.'
        : '',
    restage || !opts.correctingExisting
      ? ''
      : correctionRewritesPerson(opts.stillCorrection)
        ? 'An attached photo is the CURRENT GROUNDBILD. Keep the SAME room, furniture, camera and seats. The named person stays at this table. Redraw that speaker as the director fix says (sex and face may change). Do not keep a wrong-gender face. Do not stand them up.'
        : isCloseup
          ? 'An attached photo is the CURRENT close-up of this person. Keep the exact crop, face, hair and clothes. Change ONLY facial muscles (eyebrows, eyelids, mouth, nose wrinkle) as asked. Do not redraw a new portrait.'
          : 'An attached photo is the CURRENT still. Apply the director fix to that frame. Keep faces, clothes and place unless the fix says otherwise.',
    `Scene title: ${opts.sceneTitle || 'Scene'}.`,
    `Place: ${opts.settingHint || 'as implied'}.`,
    `Action / caption: ${opts.caption}.`,
    opts.spokenLine ? `Spoken in this moment: ${opts.spokenLine}.` : '',
    opts.imageCue ? `What we see in THIS frame only: ${opts.imageCue}.` : '',
    `Faces: ${opts.expressionHint || 'natural'}.`,
    people
      ? restage
        ? `People in frame (exactly these, each ONCE, ZERO extras): ${people}. FORBIDDEN: any guest not in this list.`
        : isInsert
        ? `People in frame (exactly these, each ONCE, no twins): ${people}.`
        : `People in frame — they MUST be visible, not an empty room: ${people}. Only these people. Do not invent a girl or an extra guest.`
      : restage
        ? 'No extra people. If the restage says alone, the room has only the named person.'
        : isInsert
        ? 'No extra people in this insert unless the cue names them.'
        : '',
    poses ? `Poses: ${poses}.` : '',
    opts.directorNote ? `Director note: ${opts.directorNote}.` : '',
    opts.stillCorrection
      ? restage
        ? `DIRECTOR RESTAGE — this is a NEW shot, not a tweak of the old still: ${opts.stillCorrection}. The old seating/group is WRONG. Guests must not appear unless this restage names them.`
        : `DIRECTOR FIX — change only this: ${opts.stillCorrection}.`
      : '',
    restage
      ? `Widescreen 16:9. NEW staging. Standing people: full body, both legs and shoes on the floor. Sitting people only if the restage says they sit. Same body scale. No extra limbs, no extra guests.`
      : isCloseup
      ? `Widescreen 16:9. Close-up crop of the same gathering. Face large. Hair not cut off at the top. Opaque eyes with iris and pupil. No legs, no floating torso, no studio cut-out, no second person, no glassy see-through eyes.`
      : isInsert
        ? `Widescreen 16:9. Insert/cutaway. The named detail fills most of the frame. Not a group wide. Not a portrait.`
        : `Widescreen 16:9. Standing people: full body, both legs and shoes on the floor. Sitting people: hips on the seat, back against the backrest, knees bent. Furniture belongs to the room. Same body scale. No extra limbs.`,
    `VISIBLE IN-WORLD TEXT (shop signs, stall labels, posters, menus, flyers, prospectus, packaging, newspapers) MUST be written in ${langEn} only.`,
    notGerman,
    `Ignore any earlier "NO text" rule for shop signs, stall labels, posters, flyers and prospectus.`,
    `NO speech bubbles, NO subtitles, NO captions, NO UI overlays, NO sound-cue lists, NO German stage directions painted on the picture (never write Wasser läuft / Kessel pfeift / Klopfen on the image). In-world print is allowed and must be in ${langEn}.`,
  ]
    .filter(Boolean)
    .join(' ')
}

export function applyPanelHarvestNote(
  board: FilmStoryboard,
  panelId: string,
  harvestNoteDe: string,
): FilmStoryboard {
  const next = normalizeFilmStoryboard(board)
  return {
    ...next,
    panels: next.panels.map((p) => (p.id === panelId ? { ...p, harvestNoteDe } : p)),
    updatedAt: new Date().toISOString(),
  }
}

/** Nach einem geänderten Bild: spätere Bilder der Szene neu malen, mit der neuen Vorlage. */
export function markLaterPanelsStaleAfterCorrection(
  board: FilmStoryboard,
  panelId: string,
): FilmStoryboard {
  const next = normalizeFilmStoryboard(board)
  const panel = next.panels.find((p) => p.id === panelId)
  if (!panel) return next
  return {
    ...next,
    panels: next.panels.map((p) => {
      if (p.sceneId !== panel.sceneId) return p
      if (p.panelIndex <= panel.panelIndex) return p
      if (!p.stillUrl) return p
      return { ...p, harvestNoteDe: STALE_STILL_NOTE_DE }
    }),
    updatedAt: new Date().toISOString(),
  }
}

export function stillTimeoutHintDe(message: string): string {
  if (/zeitlimit|zu lange|timeout|FUNCTION_INVOCATION/i.test(message)) {
    return 'Das hat zu lange gedauert. Die fertigen Bilder bleiben. Noch einmal auf «Diese Szene erzeugen» — es macht nur die fehlenden Bilder.'
  }
  return message
}

