/**
 * Standbilder für eine Film-Szene — fertige Bilder, kein bewegter Film.
 * Bibliothek zuerst (Gesichter festhalten), Stil aus dem Film-Schritt.
 */

import { getStoryArtStyle, getStoryStylePrompt } from './story-art-styles.js'
import { STORY_STILLS_LOCK_PROMPT } from './story-stills.js'
import {
  normalizeFilmStoryboard,
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
    if (styleId && p.stillStyleId && p.stillStyleId !== styleId) return false
    return true
  }).length
  return { total, done, pending: Math.max(0, total - done) }
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

/** Fotos aus der Bibliothek (Figuren zuerst), plus letztes Standbild derselben Szene. */
export function referenceUrlsForPanel(
  panel: FilmStoryboardPanel,
  previousStillUrl?: string,
  correctFromUrl?: string,
): string[] {
  const people: string[] = []
  for (const pl of panel.placements) {
    if (pl.imageUrl) people.push(pl.imageUrl)
  }
  const bg =
    panel.background.imageUrl && panel.background.match !== 'missing'
      ? panel.background.imageUrl
      : undefined
  const ordered = (
    correctFromUrl
      ? [correctFromUrl, ...people, bg]
      : [...people, bg, previousStillUrl]
  ).filter((u): u is string => Boolean(u && u.startsWith('http')))
  return [...new Set(ordered)].slice(0, 3)
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
}): string {
  const style = getStoryStylePrompt(opts.styleId)
  const styleLabel = getStoryArtStyle(opts.styleId).label
  const people = (opts.names ?? []).filter(Boolean).join(', ')
  const poses = (opts.poseHints ?? []).filter(Boolean).join('; ')
  const langEn = filmStillLanguageEn(opts.targetLanguage)
  const lock = opts.hasLibraryRefs
    ? `${STORY_STILLS_LOCK_PROMPT} Use the attached photos as these exact people and (if present) the place. Compose ONE finished still. Pose and expression may change to match the action.`
    : 'Draw the people as described. Keep them consistent if names are given.'
  const notGerman =
    opts.targetLanguage && opts.targetLanguage.slice(0, 2).toLowerCase() !== 'de'
      ? `Never write German on signs, stalls, posters or paper (no Bratwurst, Glühwein, German menus). Use ${langEn} instead (e.g. French: saucisse, vin chaud).`
      : ''

  return [
    `FINISHED cinematic STILL FRAME for a storyboard. Not a moving film, not animation, not a rough pencil sketch.`,
    `Art style (${styleLabel}): ${style}`,
    lock,
    opts.correctingExisting
      ? 'An attached photo is the CURRENT still. Apply the director fix to that frame. Keep faces, clothes and place unless the fix says otherwise.'
      : '',
    `Scene title: ${opts.sceneTitle || 'Scene'}.`,
    `Place: ${opts.settingHint || 'as implied'}.`,
    `Action / caption: ${opts.caption}.`,
    opts.imageCue ? `What we see: ${opts.imageCue}.` : '',
    `Faces: ${opts.expressionHint || 'natural'}.`,
    people ? `People in frame: ${people}.` : '',
    poses ? `Poses: ${poses}.` : '',
    opts.directorNote ? `Director note: ${opts.directorNote}.` : '',
    opts.stillCorrection
      ? `DIRECTOR FIX — change only this: ${opts.stillCorrection}.`
      : '',
    `Widescreen 16:9, full bodies when they are in the scene, both legs and shoes visible when standing.`,
    `VISIBLE IN-WORLD TEXT (shop signs, stall labels, posters, menus, flyers, prospectus, packaging, newspapers) MUST be written in ${langEn} only.`,
    notGerman,
    `Ignore any earlier "NO text" rule for shop signs, stall labels, posters, flyers and prospectus.`,
    `NO speech bubbles, NO subtitles, NO captions, NO UI overlays. In-world print is allowed and must be in ${langEn}.`,
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

export function stillTimeoutHintDe(message: string): string {
  if (/zeitlimit|zu lange|timeout|FUNCTION_INVOCATION/i.test(message)) {
    return 'Das hat zu lange gedauert. Die fertigen Bilder bleiben. Noch einmal auf «Diese Szene erzeugen» — es macht nur die fehlenden Bilder.'
  }
  return message
}

