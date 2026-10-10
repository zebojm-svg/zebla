/**
 * Nach jedem Standbild: Figur(en) und Hintergrund in die Bibliothek.
 * Überlappende Leute bekommen je eine eigene Maske — kein Gruppen-Klumpen.
 * Gleiche Figur+Pose nicht endlos neu speichern: erste gute Pose behalten.
 */

import { characterBaseName } from './character-parts.js'
import {
  matchBackground,
  matchCharacterPose,
  normalizeFilmStoryboard,
  type FilmStoryboard,
  type FilmStoryboardPanel,
} from './film-storyboard.js'
import { getStillPose, type StillPoseId } from './story-stills.js'
import type { StoryLibraryAsset } from './story-types.js'

export const HARVEST_TAG = 'harvested'
export const HARVEST_FROM_STILL_TAG = 'from-still'

export const HARVEST_CUTOUT_MIN_RATIO = 0.006
export const HARVEST_CUTOUT_MAX_RATIO = 0.72
export const HARVEST_BLOB_IOU_MAX = 0.55

const LOCATION_STOP = new Set([
  'der', 'die', 'das', 'und', 'mit', 'ein', 'eine', 'einem', 'einer',
  'im', 'in', 'am', 'an', 'auf', 'dem', 'den', 'des', 'von', 'vom', 'für',
  'the', 'and', 'at', 'of',
])

export type HarvestFigure = {
  name: string
  poseId: StillPoseId
  poseHint: string
}

export type HarvestPieceStatus = 'saved' | 'skipped' | 'failed'

export type HarvestPiece = {
  label: string
  kind: 'character' | 'environment' | 'prop'
  status: HarvestPieceStatus
  detailDe?: string
}

export type HarvestPlan = {
  figures: HarvestFigure[]
  backgroundName: string
  backgroundHint: string
  props: HarvestProp[]
}

export type HarvestProp = {
  key: string
  name: string
  en: string
  category: 'moebel' | 'deko' | 'sonstiges'
}

export const HARVEST_PROP_MAX = 3

/** Wörter im Bildtext → Möbel, das man einzeln wiederverwenden kann. */
export const FURNITURE_CATALOG: Array<{
  key: string
  words: string[]
  de: string
  en: string
  category: HarvestProp['category']
}> = [
  { key: 'stuhl', words: ['stuhl', 'stühle', 'chair', 'chaise'], de: 'Stuhl', en: 'chair', category: 'moebel' },
  { key: 'sessel', words: ['sessel', 'armchair', 'fauteuil'], de: 'Sessel', en: 'armchair', category: 'moebel' },
  { key: 'bank', words: ['parkbank', 'sitzbank', 'bench', 'banc'], de: 'Bank', en: 'bench', category: 'moebel' },
  { key: 'tisch', words: ['tisch', 'table', 'tablette'], de: 'Tisch', en: 'table', category: 'moebel' },
  { key: 'sofa', words: ['sofa', 'couch', 'canapé'], de: 'Sofa', en: 'sofa', category: 'moebel' },
  { key: 'theke', words: ['theke', 'tresen', 'counter', 'comptoir'], de: 'Theke', en: 'counter', category: 'moebel' },
  { key: 'regal', words: ['regal', 'bookshelf', 'étagère', 'etagere'], de: 'Regal', en: 'shelf', category: 'moebel' },
  { key: 'lampe', words: ['lampe', 'laterne', 'lamp', 'lanterne'], de: 'Lampe', en: 'lamp', category: 'deko' },
  { key: 'hocker', words: ['hocker', 'stool', 'tabouret'], de: 'Hocker', en: 'stool', category: 'moebel' },
  { key: 'rolltreppe', words: ['rolltreppe', 'escalator'], de: 'Rolltreppe', en: 'escalator', category: 'sonstiges' },
  { key: 'kasse', words: ['kasse', 'kassentisch', 'checkout'], de: 'Kasse', en: 'checkout counter', category: 'moebel' },
  { key: 'stand', words: ['marktstand', 'verkaufsstand', 'infostand', 'stall'], de: 'Stand', en: 'stall', category: 'moebel' },
]

export function harvestPropsFromText(text: string): HarvestProp[] {
  const hay = text.toLowerCase()
  const out: HarvestProp[] = []
  const seen = new Set<string>()
  for (const row of FURNITURE_CATALOG) {
    if (seen.size >= HARVEST_PROP_MAX) break
    if (!row.words.some((w) => hay.includes(w))) continue
    if (seen.has(row.key)) continue
    seen.add(row.key)
    out.push({ key: row.key, name: row.de, en: row.en, category: row.category })
  }
  return out
}

export function harvestFigureLabel(figure: HarvestFigure): string {
  const pose = figure.poseHint.trim() || getStillPose(figure.poseId).label
  return `${figure.name} (${pose})`
}

export function harvestBackgroundLabel(name: string): string {
  return `Hintergrund ${name.trim() || 'Ort'}`
}

/** Eine Pose pro Person in diesem Bild (erster Eintrag gewinnt). */
export function harvestFiguresFromPanel(panel: FilmStoryboardPanel): HarvestFigure[] {
  const seen = new Set<string>()
  const out: HarvestFigure[] = []
  for (const pl of panel.placements) {
    const name = pl.name.trim()
    if (!name) continue
    const key = characterBaseName(name).toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({ name, poseId: pl.poseId, poseHint: pl.poseHint })
  }
  return out
}

export function harvestBackgroundName(panel: FilmStoryboardPanel, sceneTitle?: string): string {
  const hint = panel.background.hint.trim() || panel.settingHint.trim() || sceneTitle?.trim() || ''
  return hint || 'Ort'
}

export function harvestPlanFromPanel(panel: FilmStoryboardPanel, sceneTitle?: string): HarvestPlan {
  const backgroundHint =
    panel.background.hint.trim() || panel.settingHint.trim() || sceneTitle?.trim() || ''
  const propText = [backgroundHint, panel.settingHint, panel.imageCue, panel.caption]
    .filter(Boolean)
    .join(' ')
  return {
    figures: harvestFiguresFromPanel(panel),
    backgroundName: harvestBackgroundName(panel, sceneTitle),
    backgroundHint,
    props: harvestPropsFromText(propText),
  }
}

export function locationTags(hint: string): string[] {
  return hint
    .toLowerCase()
    .split(/[^a-zäöüß0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !LOCATION_STOP.has(t))
}

export function characterHarvestTags(poseId: StillPoseId): string[] {
  const pose = getStillPose(poseId)
  return [pose.id, pose.label.toLowerCase(), HARVEST_TAG, HARVEST_FROM_STILL_TAG]
}

/** Neu gezeichnete Studio-Figur — nicht aus einem Gruppenbild geschnitten. */
export function characterPieceTags(poseId: StillPoseId): string[] {
  const pose = getStillPose(poseId)
  return [pose.id, pose.label.toLowerCase(), 'studio']
}

export function environmentHarvestTags(hint: string): string[] {
  return [...locationTags(hint), HARVEST_TAG, HARVEST_FROM_STILL_TAG, 'environment']
}

export function environmentPieceTags(hint: string): string[] {
  return [...locationTags(hint), 'environment', 'studio']
}

export function isHarvestedFromStill(asset: Pick<StoryLibraryAsset, 'tags'>): boolean {
  return (asset.tags ?? []).includes(HARVEST_FROM_STILL_TAG)
}

/** Freisteller aus alten Gruppenbildern nicht als Vorlage für neue Standbilder. */
export function libraryForCompose(library: StoryLibraryAsset[]): StoryLibraryAsset[] {
  return library.filter((a) => !isHarvestedFromStill(a))
}

export function propHarvestTags(prop: HarvestProp): string[] {
  return [prop.key, prop.name.toLowerCase(), prop.category, HARVEST_TAG, HARVEST_FROM_STILL_TAG, 'prop']
}

export function harvestPropLabel(prop: HarvestProp): string {
  return prop.name
}

export function shouldSkipProp(library: StoryLibraryAsset[], prop: HarvestProp): boolean {
  const needle = prop.key.toLowerCase()
  const name = prop.name.toLowerCase()
  return library.some(
    (a) =>
      a.type === 'prop' &&
      (a.tags.includes(needle) || a.name.trim().toLowerCase() === name),
  )
}

export function namedPropExtractPrompt(prop: HarvestProp): string {
  return (
    `Extract ONLY the ${prop.en} (${prop.name}) from this still as an isolated object ` +
    `on a TRUE TRANSPARENT background (PNG alpha). Keep exact shape, color and perspective. ` +
    `No people, no floor, no walls, no checkerboard, no extra furniture. ` +
    `If several similar objects exist, extract the most prominent one.`
  )
}

export function cutoutRatioLooksLikeProp(ratio: number): boolean {
  return ratio >= 0.002 && ratio <= 0.62
}

/**
 * Erste gute Pose behalten. Nicht Julien (Gehen) zehnmal speichern.
 * «Gut» = Bibliothek hat schon genau diese Figur+Pose mit Bild (reuse).
 * Spiegel-Pose (transform) zählt nicht — die echte Pose speichern wir trotzdem.
 */
export function shouldSkipCharacterPose(
  library: StoryLibraryAsset[],
  name: string,
  poseId: StillPoseId,
): boolean {
  return matchCharacterPose(name, poseId, library).match === 'reuse'
}

/** Gleicher Ort schon da → nicht nochmal den Markt speichern. */
export function shouldSkipBackground(library: StoryLibraryAsset[], hint: string): boolean {
  const needle = hint.trim()
  if (!needle) return false
  return matchBackground(needle, library).match === 'reuse'
}

export function cutoutRatioLooksIsolated(ratio: number): boolean {
  return ratio >= HARVEST_CUTOUT_MIN_RATIO && ratio <= HARVEST_CUTOUT_MAX_RATIO
}

export function masksLookLikeSameBlob(iou: number): boolean {
  return iou >= HARVEST_BLOB_IOU_MAX
}

export function namedPersonMaskPrompt(name: string, otherNames: string[]): string {
  const others = otherNames.filter(
    (n) => n.trim() && n.trim().toLowerCase() !== name.trim().toLowerCase(),
  )
  const overlap =
    others.length > 0
      ? `CRITICAL: ${others.join(' and ')} ${others.length > 1 ? 'are' : 'is'} also in the photo. ` +
        `Paint those other people BLACK, including where they overlap ${name}. ` +
        `Do NOT make one white blob for the whole group. Only ${name} is WHITE. ` +
        `If bodies overlap, WHITE is only pixels that belong to ${name}, never the other body. `
      : ''
  return (
    `Create a STENCIL, not a painting: a black-and-white silhouette MASK of ONLY ${name} in this exact photo. ` +
    `Same size, same pose, same position. Do NOT copy the photograph, do NOT keep clothing colors. ` +
    overlap +
    `WHITE (#FFFFFF) = the complete ${name} including hair, skin, eyes, teeth, ` +
    `ALL clothing even if it is white, cream, grey or a hoodie, ALL shoes even if white. ` +
    `Never include the chair, sofa, armchair, bench, cushion, table or floor ${name} sits on — those stay BLACK. ` +
    `BLACK (#000000) = background AND furniture AND every other person AND true holes (between arms and torso, between fingers, between legs). ` +
    `Never paint a white hoodie, shirt, sneaker or face of ${name} as black. Pale clothes of ${name} stay WHITE. ` +
    `Only black and white.`
  )
}

export function namedPersonExtractPrompt(name: string, otherNames: string[]): string {
  const others = otherNames.filter(
    (n) => n.trim() && n.trim().toLowerCase() !== name.trim().toLowerCase(),
  )
  const overlap =
    others.length > 0
      ? `Other people (${others.join(', ')}) must not appear at all, even if they overlap ${name}. ` +
        `If someone covers ${name}, reconstruct only ${name}'s occluded parts. `
      : ''
  return (
    `Extract ONLY ${name} from this still as an isolated full-body sprite on a TRUE TRANSPARENT background (PNG alpha). ` +
    overlap +
    `Keep ${name}'s exact pose, face, hair, clothes and shoes. Do NOT draw a checkerboard, studio wall, floor or other people. ` +
    `Do not keep the chair, sofa, armchair or bench ${name} is sitting on. ` +
    `Do not crop a rectangle that still contains another person.`
  )
}

export const STILL_BACKGROUND_EXTRACT_PROMPT =
  'Edit this still: remove EVERY person completely. Fill the holes with the matching place ' +
  '(street, stall, mall, snow, lights, architecture, market). Keep the same camera and location. ' +
  'No people, no silhouettes, no ghost limbs, no mannequins. Empty background only.'

export function joinDe(items: string[]): string {
  const clean = items.map((s) => s.trim()).filter(Boolean)
  if (clean.length === 0) return ''
  if (clean.length === 1) return clean[0]!
  if (clean.length === 2) return `${clean[0]} und ${clean[1]}`
  return `${clean.slice(0, -1).join(', ')} und ${clean[clean.length - 1]}`
}

export function harvestNoteDe(pieces: HarvestPiece[]): string {
  const saved = pieces.filter((p) => p.status === 'saved').map((p) => p.label)
  const skipped = pieces.filter((p) => p.status === 'skipped').map((p) => p.label)
  const failed = pieces.filter((p) => p.status === 'failed')
  const bits: string[] = []
  if (saved.length === 1) bits.push(`${saved[0]} liegt jetzt in der Bibliothek.`)
  else if (saved.length > 1) bits.push(`${joinDe(saved)} liegen jetzt in der Bibliothek.`)
  if (skipped.length === 1) bits.push(`${skipped[0]} war schon in der Bibliothek.`)
  else if (skipped.length > 1) bits.push(`${joinDe(skipped)} waren schon in der Bibliothek.`)
  for (const piece of failed) {
    bits.push(piece.detailDe || `${piece.label} konnte nicht freigestellt werden.`)
  }
  if (bits.length === 0) {
    return 'Das Standbild ist da, aber Figuren und Hintergrund konnten nicht in die Bibliothek gelegt werden.'
  }
  return bits.join(' ')
}

export function sceneHarvestNotesDe(panels: FilmStoryboardPanel[]): string[] {
  const out: string[] = []
  for (const panel of panels) {
    const note = panel.harvestNoteDe?.trim()
    if (note && !out.includes(note)) out.push(note)
  }
  return out
}

/** Storyboard neu gegen die Bibliothek halten — gelbe «fehlt»-Kasten sollen verschwinden. */
export function rematchFilmBoard(
  board: FilmStoryboard,
  library: StoryLibraryAsset[],
): FilmStoryboard {
  const next = normalizeFilmStoryboard(board)
  return {
    ...next,
    panels: next.panels.map((panel) => ({
      ...panel,
      placements: panel.placements.map((pl) => {
        const matched = matchCharacterPose(pl.name, pl.poseId, library)
        return {
          ...pl,
          libraryAssetId: matched.libraryAssetId,
          imageUrl: matched.imageUrl,
          match: matched.match,
          matchNoteDe: matched.matchNoteDe,
          flip: pl.layoutLocked || pl.layoutByAi ? pl.flip : matched.flip,
        }
      }),
      background: matchBackground(panel.background.hint || panel.settingHint, library),
    })),
    updatedAt: new Date().toISOString(),
  }
}
