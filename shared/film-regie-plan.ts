/**
 * Die Regie plant jedes Bild einzeln: welcher Ort, wer ist körperlich da, wer nur auf einem Bildschirm,
 * wo steht die Kamera, welche Vorlagen gehen mit und wofür.
 * Keine festen Regeln pro Lage — alles kommt aus Regiebuch und Dialog.
 */

import type { FilmContinuity } from './film-continuity.js'

export interface FilmRegiePlanRef {
  id: string
  url: string
  /** Wofür der Maler dieses Foto benutzt, englisch, von der Regie. */
  useEn: string
}

export interface FilmRegiePlan {
  place: string
  /** Körperlich im Bild. */
  bodies: string[]
  /** Nur auf einem Bildschirm zu sehen. */
  screens: string[]
  /** Ein deutscher Satz für Jean-Marie: wo die Kamera steht und wohin sie schaut. */
  cameraDe: string
  /** Der ganze Auftrag an den Maler. */
  paintEn: string
  refs: FilmRegiePlanRef[]
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

function knownNames(raw: unknown, known: string[]): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    const name = clip(item, 40)
    if (!name) continue
    const match = known.find((have) => sameName(have, name)) ?? (known.length ? undefined : name)
    if (match && !out.some((have) => sameName(have, match))) out.push(match)
  }
  return out.slice(0, 8)
}

export function sanitizeRegiePlan(
  raw: unknown,
  opts: { places: string[]; people: string[]; options: RegieRefOption[] },
): FilmRegiePlan | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const paintEn = clip(row.paintEn, 1800)
  const cameraDe = clip(row.cameraDe, 240)
  if (!paintEn || !cameraDe) return null
  const placeRaw = clip(row.place, 40)
  const place = opts.places.find((name) => sameName(name, placeRaw)) ?? placeRaw
  const bodies = knownNames(row.bodies, opts.people)
  const screens = knownNames(row.screens, opts.people).filter((name) => !bodies.some((b) => sameName(b, name)))
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
  return { place, bodies, screens, cameraDe, paintEn, refs }
}

export function isFilmRegiePlan(value: unknown): value is FilmRegiePlan {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.paintEn === 'string' && typeof row.cameraDe === 'string' && Array.isArray(row.refs)
}

/** Kurz, für die Regie beim nächsten Bild und für das Urteil. */
export function regiePlanSummaryDe(plan: FilmRegiePlan): string {
  return [
    plan.place ? `Ort ${plan.place}` : '',
    plan.bodies.length ? `im Raum: ${plan.bodies.join(', ')}` : 'niemand im Raum',
    plan.screens.length ? `nur auf Bildschirm: ${plan.screens.join(', ')}` : '',
    `Kamera: ${plan.cameraDe}`,
  ]
    .filter(Boolean)
    .join('; ')
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
  const place = opts.continuity?.places.find((item) => sameName(item.name, opts.plan.place))
  const fix = opts.fixEn?.trim()
  return [
    fix ? `DIRECTOR FIX, the last try of this picture was wrong. This comes first: ${fix}` : '',
    'FINISHED STILL FRAME for an illustrated story. One single coherent illustration, not a collage, not cut-outs, not a sketch.',
    `Art style (${opts.styleLabel}): ${opts.stylePrompt}`,
    `DIRECTOR'S INSTRUCTION FOR THIS PICTURE: ${opts.plan.paintEn}`,
    place ? `Place ${place.name}: ${place.lookEn}` : opts.plan.place ? `Place: ${opts.plan.place}.` : '',
    people.length ? `Looks (same in every picture): ${people.join(' ')}` : '',
    opts.plan.bodies.length
      ? `Physically present in this picture, each exactly once: ${opts.plan.bodies.join(', ')}.`
      : 'Nobody is physically present unless the instruction names them.',
    opts.plan.screens.length ? `Seen only on a screen, not as a body in the room: ${opts.plan.screens.join(', ')}.` : '',
    'Each person appears once. No twins, no extra strangers.',
    'Eyes fully drawn: white sclera, coloured iris, dark pupil.',
    'No speech bubbles, no subtitles, no captions, no written stage directions on the image.',
    `Do not invent lettering. Only write text the instruction names; any visible text is in ${opts.languageEn}.`,
    'Widescreen 16:9.',
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
