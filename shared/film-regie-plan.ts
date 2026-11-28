/**
 * Die Regie plant jedes Bild einzeln: welcher Ort, wer ist körperlich da, wer nur auf einem Bildschirm,
 * wo steht die Kamera, welche Vorlagen gehen mit und wofür.
 * Keine festen Regeln pro Lage — alles kommt aus Regiebuch und Dialog.
 */

import { placeForName, type FilmContinuity } from './film-continuity.js'
import { isNarratorName, isStageSpeaker } from './types.js'
import type { StoredRegieCheck } from './film-regie-judge.js'

export interface FilmRegiePlanRef {
  id: string
  url: string
  /** Wofür der Maler dieses Foto benutzt, englisch, von der Regie. */
  useEn: string
}

/**
 * Eine Fläche im Bild, auf der etwas anderes zu sehen ist als der Raum der Kamera:
 * Bildschirm, Fernseher, Telefon, Spiegel, Anzeigetafel, Foto an der Wand …
 */
export interface FilmRegieSurface {
  /** Was für ein Gerät oder Rahmen, kurz, deutsch («Lenas Laptop», «Anzeigetafel»). */
  thing: string
  /** Wer darauf zu sehen ist. */
  people: string[]
  /** Welcher Ort darauf zu sehen ist (Name aus dem Regiebuch), leer wenn keiner. */
  place: string
  /** Was darauf zu sehen ist, englisch, für den Maler. */
  showsEn: string
}

export interface FilmRegiePlan {
  /** Der Raum, in dem die Kamera steht. Alles um die Leute und um die Geräte herum gehört dazu. */
  place: string
  /** Nur wenn der Ort noch nicht im Regiebuch steht: wie er aussieht, englisch, von der Regie. */
  placeLookEn?: string
  /** Körperlich im Bild. */
  bodies: string[]
  /** Nur auf einer Fläche (Bildschirm, Spiegel …) zu sehen. */
  screens: string[]
  /** Was auf Flächen im Bild zu sehen ist und welchen Ort sie zeigen. Fehlt bei alten Plänen. */
  surfaces?: FilmRegieSurface[]
  /** Ein deutscher Satz für Jean-Marie: wo die Kamera steht und wohin sie schaut. */
  cameraDe: string
  /** Kamera-Standort, Richtung, Nähe und Blick der Leute, englisch. Steht am Ende des Auftrags noch einmal. */
  cameraEn?: string
  /** Absichtlich derselbe Blick wie das vorige Bild. Sonst muss das Bild sich unterscheiden. */
  sameFraming?: boolean
  /** Der ganze Auftrag an den Maler. */
  paintEn: string
  refs: FilmRegiePlanRef[]
}

/** Ein Malversuch für ein Bild: was gemalt wurde, womit, und was die Regie dazu sagte. Nur Links und kurze Sätze. */
export interface RegieAttempt {
  stillUrl: string
  at: string
  planned: boolean
  verdict?: StoredRegieCheck & { seenDe?: string }
  /** Auftrag der Regie an den Maler für diesen Versuch (nach einem Fehler). */
  fixEn?: string
  /** Jean-Maries Hinweis bei «Bild ändern». */
  hintDe?: string
  /** Was dem Maler mitgeschickt wurde und wofür. */
  refs?: Array<{ url: string; useEn: string }>
  /** Das Bild war fast eine Kopie dieses früheren Bildes, obwohl der Plan ein neues wollte. */
  copyOf?: string
}

export const REGIE_ATTEMPTS_MAX = 6

/** Neuer Versuch. fresh = neuer Durchgang für dieses Bild: alte Versuche fallen weg. */
export function addRegieAttempt(
  attempts: RegieAttempt[] | undefined,
  attempt: RegieAttempt,
  fresh: boolean,
): RegieAttempt[] {
  const clean: RegieAttempt = {
    ...attempt,
    ...(attempt.fixEn ? { fixEn: attempt.fixEn.slice(0, 400) } : {}),
    ...(attempt.hintDe ? { hintDe: attempt.hintDe.slice(0, 300) } : {}),
    ...(attempt.copyOf ? { copyOf: attempt.copyOf } : {}),
    refs: (attempt.refs ?? [])
      .filter((ref) => ref.url.startsWith('http'))
      .slice(0, 4)
      .map((ref) => ({ url: ref.url, useEn: ref.useEn.slice(0, 200) })),
  }
  return [...(fresh ? [] : (attempts ?? [])), clean].slice(-REGIE_ATTEMPTS_MAX)
}

/** Urteil der Regie zum Versuch mit diesem Bild. */
export function setRegieAttemptVerdict(
  attempts: RegieAttempt[] | undefined,
  stillUrl: string,
  verdict: StoredRegieCheck & { seenDe?: string },
): RegieAttempt[] | undefined {
  if (!attempts?.length) return attempts
  const at = attempts.map((item) => item.stillUrl).lastIndexOf(stillUrl)
  if (at < 0) return attempts
  const stored: StoredRegieCheck & { seenDe?: string } = {
    ok: verdict.ok,
    noteDe: verdict.noteDe.slice(0, 240),
    ...(verdict.unchecked ? { unchecked: true } : {}),
    ...(verdict.failed?.length ? { failed: verdict.failed.slice(0, 10) } : {}),
    ...(verdict.softDe ? { softDe: verdict.softDe.slice(0, 200) } : {}),
    ...(verdict.model ? { model: verdict.model.slice(0, 60) } : {}),
    ...(verdict.seenDe ? { seenDe: verdict.seenDe.slice(0, 400) } : {}),
  }
  return attempts.map((item, index) => (index === at ? { ...item, verdict: stored } : item))
}

/** Eine Vorlage, die die Regie für ein Bild wählen kann. */
export interface RegieRefOption {
  id: string
  url: string
  /** Was auf dem Foto ist, deutsch, für die Regie. */
  aboutDe: string
}

export const REGIE_PLAN_MAX_REFS = 3

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** «Amir (on screen)» ist Amir. Handlung, Erzähler usw. sind keine Personen. */
function knownNames(raw: unknown, known: string[]): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' && raw.trim() ? raw.split(',') : []
  const out: string[] = []
  for (const item of list) {
    const name = clip(item, 60)
    if (!name || isStageSpeaker(name) || isNarratorName(name)) continue
    const words = name.toLowerCase().split(/[^\p{L}\p{N}]+/u)
    const match =
      known.find((have) => sameName(have, name)) ??
      known.find((have) => have.trim() && words.includes(have.trim().toLowerCase())) ??
      (known.length ? undefined : name)
    if (match && !out.some((have) => sameName(have, match))) out.push(match)
  }
  return out.slice(0, 8)
}

export type RegiePlanRead = { plan: FilmRegiePlan; errorDe?: undefined } | { plan?: undefined; errorDe: string }

/** Liest die Antwort der Regie. Ein Ort, der noch nicht im Regiebuch steht, gilt auch. */
export function readRegiePlan(
  raw: unknown,
  opts: { places: string[]; people: string[]; options: RegieRefOption[] },
): RegiePlanRead {
  const first = Array.isArray(raw) ? raw.find((item) => item && typeof item === 'object') : raw
  if (!first || typeof first !== 'object') return { errorDe: 'Die Antwort der Regie war leer.' }
  const row = first as Record<string, unknown>
  const paintEn = clip(row.paintEn, 1800)
  const cameraDe = clip(row.cameraDe, 240)
  if (!paintEn && !cameraDe) return { errorDe: 'Die Regie hat keinen Auftrag und keinen Kamera-Satz geschrieben.' }
  if (!paintEn) return { errorDe: 'Die Regie hat keinen Auftrag an den Maler geschrieben.' }
  if (!cameraDe) return { errorDe: 'Die Regie hat nicht gesagt, wo die Kamera steht.' }
  const placeRaw = clip(row.place, 60)
  const known = placeForName(opts.places, placeRaw)
  const place = known ?? placeRaw
  const placeLookEn = known ? '' : clip(row.placeLookEn, 400)
  const bodies = knownNames(row.bodies, opts.people)
  const surfaces: FilmRegieSurface[] = []
  for (const item of Array.isArray(row.surfaces) ? row.surfaces : []) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>
    const thing = clip(entry.thing, 60)
    const showsEn = clip(entry.showsEn ?? entry.shows, 400)
    const placeRawSurface = clip(entry.place, 60)
    const people = knownNames(entry.people, opts.people).filter((name) => !bodies.some((b) => sameName(b, name)))
    if (!thing || (!showsEn && !people.length && !placeRawSurface)) continue
    surfaces.push({
      thing,
      people,
      place: placeForName(opts.places, placeRawSurface) ?? placeRawSurface,
      showsEn,
    })
    if (surfaces.length >= 4) break
  }
  const screens = [...knownNames(row.screens, opts.people), ...surfaces.flatMap((surface) => surface.people)].filter(
    (name, index, all) =>
      !bodies.some((b) => sameName(b, name)) && all.findIndex((have) => sameName(have, name)) === index,
  )
  const cameraEn = clip(row.cameraEn, 400)
  const refs: FilmRegiePlanRef[] = []
  for (const item of Array.isArray(row.refs) ? row.refs : []) {
    const entry = item as Record<string, unknown>
    const id = clip(entry?.id, 20)
    const option = opts.options.find((have) => have.id === id)
    const useEn = clip(entry?.useEn, 300)
    if (!option || !useEn || refs.some((have) => have.url === option.url)) continue
    refs.push({ id, url: option.url, useEn })
    if (refs.length >= REGIE_PLAN_MAX_REFS) break
  }
  return {
    plan: {
      place,
      ...(placeLookEn ? { placeLookEn } : {}),
      bodies,
      screens,
      ...(surfaces.length ? { surfaces } : {}),
      cameraDe,
      ...(cameraEn ? { cameraEn } : {}),
      ...(row.sameFraming === true ? { sameFraming: true } : {}),
      paintEn,
      refs,
    },
  }
}

export function sanitizeRegiePlan(
  raw: unknown,
  opts: { places: string[]; people: string[]; options: RegieRefOption[] },
): FilmRegiePlan | null {
  return readRegiePlan(raw, opts).plan ?? null
}

/** Unter dem Bild, wenn die Regie nicht planen konnte. */
export function regiePlanErrorLineDe(reason: string): string {
  return `Regie konnte dieses Bild nicht planen: ${reason.trim().replace(/[.\s]+$/, '')}. Gemalt wurde ohne Plan.`
}

export const PAINTED_WITH_PLAN_DE = 'Gemalt nach dem Plan der Regie.'
export const PAINTED_WITHOUT_PLAN_DE = 'Gemalt ohne Plan der Regie (alter Weg).'

export function isFilmRegiePlan(value: unknown): value is FilmRegiePlan {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.paintEn === 'string' && typeof row.cameraDe === 'string' && Array.isArray(row.refs)
}

function surfaceDe(surface: FilmRegieSurface): string {
  const who = surface.people.length ? surface.people.join(', ') : ''
  const where = surface.place ? `Ort ${surface.place}` : ''
  const what = [who, where].filter(Boolean).join(' vor ')
  return `auf ${surface.thing}: ${what || surface.showsEn.slice(0, 80) || 'etwas'}`
}

/** Kurz, für die Regie beim nächsten Bild und für das Urteil. */
export function regiePlanSummaryDe(plan: FilmRegiePlan): string {
  const surfaces = plan.surfaces ?? []
  const onSurface = new Set(surfaces.flatMap((surface) => surface.people.map((name) => name.toLowerCase())))
  const looseScreens = plan.screens.filter((name) => !onSurface.has(name.toLowerCase()))
  return [
    plan.place ? `Ort der Kamera ${plan.place}` : '',
    plan.placeLookEn ? `(neuer Ort, so sieht er aus: ${plan.placeLookEn.slice(0, 200)})` : '',
    plan.bodies.length ? `im Raum: ${plan.bodies.join(', ')}` : 'niemand im Raum',
    ...surfaces.map(surfaceDe),
    looseScreens.length ? `nur auf Bildschirm: ${looseScreens.join(', ')}` : '',
    `Kamera: ${plan.cameraDe}`,
    plan.sameFraming ? 'gleicher Blick wie das vorige Bild: ja' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

/** Für die Notiz unter dem Bild: wo die Kamera steht und was auf Flächen zu sehen ist. */
export function regiePlanPlacesDe(plan: FilmRegiePlan): string {
  const surfaces = plan.surfaces ?? []
  const onSurface = new Set(surfaces.flatMap((surface) => surface.people.map((name) => name.toLowerCase())))
  const looseScreens = plan.screens.filter((name) => !onSurface.has(name.toLowerCase()))
  return [
    plan.place ? `Ort: ${plan.place}.` : '',
    ...surfaces.map((surface) => {
      const who = surface.people.join(', ')
      const where = surface.place ? ` (${surface.place})` : ''
      return `Auf ${surface.thing}: ${who || surface.showsEn.slice(0, 60) || 'etwas'}${where}.`
    }),
    looseScreens.length ? `Nur auf einem Bildschirm: ${looseScreens.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/** Regiebuch mit deutschen und englischen Beschreibungen, für die Regie. */
export function regiebuchForPlanning(note: FilmContinuity): string {
  return [
    `Lage: ${note.situationDe}`,
    `Lage (englisch): ${note.situationEn}`,
    ...note.people.map((person) => `Person ${person.name}: ${person.lookDe || ''} | EN: ${person.lookEn}`),
    ...note.places.map((place) => `Ort ${place.name}: ${place.lookDe || ''} | EN: ${place.lookEn}`),
    ...note.locksEn.map((lock) => `Bleibt: ${lock}`),
    ...(note.notesDe ?? []).map((line) => `Gilt (Jean-Marie): ${line}`),
  ]
    .filter((line) => line.trim())
    .join('\n')
}

/** Auftrag an den Maler, wenn die Regie das Bild geplant hat. Nur allgemeine Malregeln, keine Lage-Regeln. */
export function regiePaintPromptEn(opts: {
  plan: FilmRegiePlan
  continuity?: FilmContinuity
  styleLabel: string
  stylePrompt: string
  languageEn: string
  fixEn?: string
}): string {
  const inPlan = (name: string) =>
    [...opts.plan.bodies, ...opts.plan.screens].some((have) => sameName(have, name))
  const people = (opts.continuity?.people ?? [])
    .filter((person) => inPlan(person.name))
    .map((person) => `${person.name}: ${person.lookEn}`)
  const placeNames = opts.continuity?.places.map((item) => item.name) ?? []
  const placeName = placeForName(placeNames, opts.plan.place)
  const place = opts.continuity?.places.find((item) => item.name === placeName)
  const cameraPlace = place?.name || opts.plan.place
  const fix = opts.fixEn?.trim()
  const surfaces = opts.plan.surfaces ?? []
  const onSurface = new Set(surfaces.flatMap((surface) => surface.people.map((name) => name.toLowerCase())))
  const looseScreens = opts.plan.screens.filter((name) => !onSurface.has(name.toLowerCase()))
  const surfaceLines = surfaces.map((surface) => {
    const shownName = placeForName(placeNames, surface.place)
    const shown = opts.continuity?.places.find((item) => item.name === shownName)
    const who = surface.people.length ? ` Seen on it: ${surface.people.join(', ')}.` : ''
    const where = shown
      ? ` Behind them on it: ${shown.name} (${shown.lookEn.slice(0, 300)}).`
      : surface.place
        ? ` It shows the place ${surface.place}.`
        : ''
    const room = cameraPlace ? ` The room around ${surface.thing} stays ${cameraPlace}.` : ''
    return `PICTURE ON ${surface.thing}: ${surface.showsEn}${who}${where} This image exists only inside the frame of ${surface.thing}.${room}`
  })
  const camera = opts.plan.cameraEn?.trim()
  return [
    fix ? `DIRECTOR FIX, the last try of this picture was wrong. This comes first: ${fix}` : '',
    'FINISHED STILL FRAME for an illustrated story. One single coherent illustration, not a collage, not cut-outs, not a sketch.',
    `Art style (${opts.styleLabel}): ${opts.stylePrompt}`,
    `DIRECTOR'S INSTRUCTION FOR THIS PICTURE: ${opts.plan.paintEn}`,
    place
      ? `Place ${place.name} (the room the camera stands in; walls, floor and furniture around the people belong here): ${place.lookEn}`
      : opts.plan.place
        ? `Place ${opts.plan.place} (the room the camera stands in)${opts.plan.placeLookEn ? `: ${opts.plan.placeLookEn}` : '.'}`
        : '',
    ...surfaceLines,
    people.length ? `Looks (same in every picture): ${people.join(' ')}` : '',
    opts.plan.bodies.length
      ? `Physically present in this picture, each exactly once: ${opts.plan.bodies.join(', ')}.`
      : 'Nobody is physically present unless the instruction names them.',
    looseScreens.length
      ? `Seen only on a screen, not as a body in the room: ${looseScreens.join(', ')}. Each of them is in their own place; what is behind them on the screen belongs to their place, not to the room the screen stands in.`
      : '',
    'Each person appears once. No twins, no extra strangers.',
    'Exactly the listed people and nobody else, not even partly: no extra hands, arms, legs, feet or heads, no half figures at the edge.',
    'Images on screens, mirrors, boards or photos appear only inside their device or frame. Nothing floats in the air.',
    'Eyes fully drawn: white sclera, coloured iris, dark pupil.',
    'No speech bubbles, no subtitles, no captions, no written stage directions on the image.',
    `Do not invent lettering. Only write text the instruction names; any visible text is in ${opts.languageEn}.`,
    'Widescreen 16:9.',
    camera ? `CAMERA AND GAZE (most important, repeated): ${camera}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function regieAttachmentLegendEn(refs: Array<{ useEn: string }>): string {
  if (!refs.length) return ''
  return [
    'Attached photos in order:',
    ...refs.map((ref, index) => `${index + 1}. ${ref.useEn}`),
    'Use each photo only for what is written next to it. Paint a new picture; do not copy or paste a photo.',
  ].join('\n')
}
