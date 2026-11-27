import { chatJson } from './ai.js'
import { saveStoryAsset } from './story-library.js'
import { generateStoryCharacter } from './story-asset-gen.js'
import { CHARACTER_REFERENCE_LINE } from '../shared/reference-catalog.js'
import { characterPlateTags } from '../shared/catalog-order.js'
import { identityReferenceUrl } from '../shared/library-identities.js'
import { isStoryArtStyleId, type StoryArtStyleId } from '../shared/story-art-styles.js'
import type { StoryLibraryAsset } from '../shared/story-types.js'
import { isNarratorName, isStageSpeaker, type Dialog } from '../shared/types.js'
import type { FilmStoryboard, FilmStoryboardPanel } from '../shared/film-storyboard.js'
import {
  continuityBriefEn,
  continuitySourceKey,
  fallbackContinuity,
  sanitizeContinuity,
  type FilmContinuity,
} from '../shared/film-continuity.js'
import { lineStoryText } from '../shared/film-dialog-native.js'

const SYSTEM = `Du liest eine ganze Bildergeschichte, bevor irgendein Bild gemalt wird.
Du hältst einmal fest, wo die Leute sind und wie sie aussehen. Ein Wort in einer einzelnen Zeile ändert das nicht.
«Afrika» an einer anderen Stelle macht die Leute in dieser Szene nicht zu anderen Menschen.
together=false nur, wenn sie wirklich per Video, Zoom oder Bildschirm verbunden sind und nicht im selben Raum sitzen.
Sonst together=true: sie sind physisch zusammen.
lookEn beschreibt ein eigenes Gesicht, Haare, Kleidung, Brille. Keine bekannte Figur aus einem Buch oder Film.
Nur JSON:
{
  "situationDe": "ein deutscher Satz",
  "situationEn": "one English paragraph for the painter",
  "together": true,
  "people": [{ "name": "Lena", "lookEn": "woman, short dark hair, green coat" }],
  "places": [{ "name": "Küche", "lookEn": "bright kitchen, gas stove, window to the street" }],
  "locksEn": ["same green coat in every frame"]
}`

export function storyTextForContinuity(dialog: Dialog, board?: FilmStoryboard): string {
  const lines = [
    dialog.title,
    dialog.filmPrompt || '',
    dialog.imageDirection || '',
    dialog.soundDirection || '',
  ]
  for (const section of dialog.sections) {
    lines.push(section.title)
    for (const line of section.lines) {
      lines.push(`${line.speaker}: ${lineStoryText(line)} ${line.cueImage || ''}`)
    }
  }
  for (const panel of board?.panels ?? []) {
    lines.push(panel.settingHint || '')
  }
  return lines.filter(Boolean).join('\n')
}

function peopleInDialog(dialog: Dialog): string[] {
  const names: string[] = []
  for (const section of dialog.sections) {
    for (const line of section.lines) {
      const name = line.speaker?.trim()
      if (!name || isNarratorName(name) || isStageSpeaker(name)) continue
      if (!names.some((have) => have.toLowerCase() === name.toLowerCase())) names.push(name)
    }
  }
  return names
}

function placesOnBoard(board?: FilmStoryboard): string[] {
  const names: string[] = []
  for (const panel of board?.panels ?? []) {
    const name = panel.settingHint?.trim()
    if (!name) continue
    if (!names.some((have) => have.toLowerCase() === name.toLowerCase())) names.push(name)
  }
  return names.slice(0, 6)
}

export async function ensureFilmContinuity(
  dialog: Dialog,
  board?: FilmStoryboard,
): Promise<FilmContinuity> {
  const text = storyTextForContinuity(dialog, board)
  const key = continuitySourceKey(text)
  if (board?.continuity?.sourceKey === key && board.continuity.situationEn) {
    return board.continuity
  }
  const people = peopleInDialog(dialog)
  const places = placesOnBoard(board)
  try {
    const raw = await chatJson<unknown>(SYSTEM, text, {
      temperature: 0.2,
      timeoutMs: 40_000,
      timeoutMessage: 'Die Regie hat die Geschichte nicht rechtzeitig gelesen.',
    })
    const clean = sanitizeContinuity(raw, text)
    if (clean && clean.sourceKey === key) return clean
  } catch {
    /* Der Fallback hält wenigstens Raum gegen Videogespräch. */
  }
  return fallbackContinuity({ text, people, places })
}

export function briefForImage(note: FilmContinuity): string {
  return continuityBriefEn(note)
}

/** Fehlt das Stammbild dieser Person, entsteht es einmal. Danach geht dasselbe Gesicht mit. */
export async function ensureSpeakerPlate(opts: {
  userId: string
  library: StoryLibraryAsset[]
  name: string
  lookEn: string
  styleId?: string
}): Promise<{ library: StoryLibraryAsset[]; imageUrl?: string }> {
  const existing = identityReferenceUrl(opts.library, opts.name)
  if (existing) return { library: opts.library, imageUrl: existing }
  const styleId: StoryArtStyleId | undefined = isStoryArtStyleId(opts.styleId ?? '')
    ? opts.styleId
    : undefined
  const description = opts.lookEn.trim() || opts.name
  const drawn = await generateStoryCharacter(
    `${description}\n${CHARACTER_REFERENCE_LINE}`,
    opts.name,
    styleId,
    'standing',
    'front',
    'relaxed',
    undefined,
    undefined,
    'standing-front',
    false,
    false,
  )
  const saved = await saveStoryAsset(opts.userId, {
    type: 'character',
    name: opts.name,
    description,
    imageUrl: drawn.imageUrl,
    tags: characterPlateTags(styleId, description),
    styleId,
    prompt: drawn.prompt,
    legPoseId: 'standing',
    headAngleId: 'front',
    armPoseId: 'relaxed',
  })
  return { library: [saved, ...opts.library], imageUrl: saved.imageUrl }
}

export function stampReferenceFaces(
  panel: FilmStoryboardPanel,
  library: StoryLibraryAsset[],
): FilmStoryboardPanel {
  return {
    ...panel,
    placements: panel.placements.map((placement) => {
      const url = identityReferenceUrl(library, placement.name)
      if (!url) return placement
      return { ...placement, imageUrl: url }
    }),
  }
}
