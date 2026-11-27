import { chatJson, chatJsonWithImages } from './ai.js'
import { saveStoryAsset, setStoryAssetTags } from './story-library.js'
import { generateStoryCharacter, generateStoryEnvironment } from './story-asset-gen.js'
import { CHARACTER_REFERENCE_LINE, REFERENCE_TAG } from '../shared/reference-catalog.js'
import { characterPlateTags, roomPlateTags } from '../shared/catalog-order.js'
import { identityReferenceUrl } from '../shared/library-identities.js'
import { pickedCastUrl, type CatalogCast } from '../shared/catalog-cast.js'
import { isStoryArtStyleId, type StoryArtStyleId } from '../shared/story-art-styles.js'
import type { StoryLibraryAsset } from '../shared/story-types.js'
import { isNarratorName, isStageSpeaker, type Dialog } from '../shared/types.js'
import type { FilmStoryboard, FilmStoryboardPanel } from '../shared/film-storyboard.js'
import {
  continuityBriefEn,
  continuitySourceKey,
  fallbackContinuity,
  referenceJobs,
  sanitizeContinuity,
  type FilmContinuity,
  type FilmRefJob,
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
  "locksEn": ["same green coat in every frame"],
  "shots": [
    { "panelId": "die echte Bild-id", "viewKey": "kueche|weit", "sendViewKeys": [], "whyDe": "erster Blick auf die Küche" }
  ]
}
places.name ist ein oder zwei Wörter.
viewKey bleibt gleich, wenn die Kamera denselben Blick wieder zeigt.
sendViewKeys nennt frühere viewKeys, deren Bilder mitmüssen: bei einer Nahaufnahme den weiten Blick, und den eigenen viewKey, wenn dieser Blick zurückkehrt. Beim ersten Mal eines Blicks ist sendViewKeys leer.`

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
    lines.push(
      `Bild ${panel.id} | ${panel.shot || 'wide'} | ${panel.closeupSpeaker || ''} | ${panel.settingHint || ''} | ${panel.caption || ''}`,
    )
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
  const panels = (board?.panels ?? []).map((panel) => ({
    id: panel.id,
    shot: panel.shot,
    settingHint: panel.settingHint,
    closeupSpeaker: panel.closeupSpeaker,
  }))
  const cached = board?.continuity
  if (
    cached?.sourceKey === key &&
    cached.situationEn &&
    (panels.length === 0 || (cached.shots?.length ?? 0) > 0)
  ) {
    return cached
  }
  const people = peopleInDialog(dialog)
  const places = placesOnBoard(board)
  try {
    const raw = await chatJson<unknown>(SYSTEM, text, {
      temperature: 0.2,
      timeoutMs: 40_000,
      timeoutMessage: 'Die Regie hat die Geschichte nicht rechtzeitig gelesen.',
    })
    const clean = sanitizeContinuity(raw, text, panels)
    if (clean && clean.sourceKey === key) {
      return { ...clean, sideChecked: cached?.sideChecked, sideTries: cached?.sideTries }
    }
  } catch {
    /* Der Fallback hält wenigstens Raum gegen Videogespräch. */
  }
  return {
    ...fallbackContinuity({ text, people, places, panels }),
    sideChecked: cached?.sideChecked,
    sideTries: cached?.sideTries,
  }
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
  pickedIds?: string[]
}): Promise<{ library: StoryLibraryAsset[]; imageUrl?: string }> {
  const chosen = pickedCastUrl(opts.library, opts.pickedIds, opts.name)
  if (chosen) return { library: opts.library, imageUrl: chosen }
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

function named(asset: StoryLibraryAsset, name: string): boolean {
  return asset.name.trim().toLowerCase() === name.trim().toLowerCase()
}

export function sidePlate(library: StoryLibraryAsset[], name: string): StoryLibraryAsset | undefined {
  return library.find(
    (asset) =>
      asset.type === 'character' &&
      named(asset, name) &&
      (asset.tags ?? []).includes('ansicht:seite') &&
      !(asset.tags ?? []).includes('ansicht:verworfen') &&
      Boolean(asset.imageUrl),
  )
}

function placePlate(library: StoryLibraryAsset[], name: string): StoryLibraryAsset | undefined {
  return library.find(
    (asset) =>
      asset.type === 'environment' &&
      (asset.tags ?? []).includes(REFERENCE_TAG) &&
      named(asset, name) &&
      Boolean(asset.imageUrl),
  )
}

function hasName(list: string[] | undefined, name: string): boolean {
  return (list ?? []).some((item) => item.trim().toLowerCase() === name.trim().toLowerCase())
}

async function imagePart(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = Buffer.from(await res.arrayBuffer()).toString('base64')
    const mime = (res.headers.get('content-type') || 'image/png').split(';')[0] || 'image/png'
    return { mimeType: mime, data }
  } catch {
    return null
  }
}

async function samePerson(frontUrl: string, sideUrl: string): Promise<boolean | null> {
  const front = await imagePart(frontUrl)
  const side = await imagePart(sideUrl)
  if (!front || !side) return null
  try {
    const raw = await chatJsonWithImages<{ ok?: boolean }>(
      'Du vergleichst zwei Bilder. JSON: { "ok": true }. ok ist true, wenn es dieselbe Person ist: gleiches Gesicht, gleiche Haarfarbe, gleiche Kleidung. Eine andere Blickrichtung ist in Ordnung. ok ist false, wenn es klar eine andere Person ist.',
      'Erstes Bild: Stammbild von vorne. Zweites Bild: Seitenansicht. Ist es dieselbe Person?',
      [front, side],
      { temperature: 0.1, timeoutMs: 25_000, timeoutMessage: 'Der Vergleich hat zu lange gebraucht.' },
    )
    return raw.ok !== false
  } catch {
    return null
  }
}

export function jobsForLibrary(
  continuity: FilmContinuity,
  library: StoryLibraryAsset[],
  picks?: CatalogCast | null,
): FilmRefJob[] {
  return referenceJobs({
    continuity,
    hasFront: (name) => Boolean(pickedCastUrl(library, picks?.personIds, name) || identityReferenceUrl(library, name)),
    hasSide: (name) => Boolean(sidePlate(library, name)),
    hasPlace: (name) => Boolean(pickedCastUrl(library, picks?.placeIds, name) || placePlate(library, name)),
  })
}

/** Ein Referenzbild oder ein Vergleich. Das nächste kommt im nächsten Aufruf. */
export async function runNextReferenceJob(opts: {
  userId: string
  library: StoryLibraryAsset[]
  continuity: FilmContinuity
  styleId?: string
  picks?: CatalogCast | null
}): Promise<{ library: StoryLibraryAsset[]; continuity: FilmContinuity; didDe: string }> {
  const job = jobsForLibrary(opts.continuity, opts.library, opts.picks)[0]
  if (!job) {
    return { ...opts, didDe: 'Die Referenzen stehen.' }
  }
  const person = opts.continuity.people.find((item) => item.name.trim().toLowerCase() === job.name.trim().toLowerCase())
  const look = person?.lookEn || job.name
  const styleId: StoryArtStyleId | undefined = isStoryArtStyleId(opts.styleId ?? '') ? opts.styleId : undefined
  if (job.kind === 'person-front') {
    const plated = await ensureSpeakerPlate({
      userId: opts.userId,
      library: opts.library,
      name: job.name,
      lookEn: look,
      styleId,
      pickedIds: opts.picks?.personIds,
    })
    return {
      library: plated.library,
      continuity: opts.continuity,
      didDe: `Stammbild von ${job.name} gezeichnet.`,
    }
  }
  if (job.kind === 'person-side') {
    const front =
      pickedCastUrl(opts.library, opts.picks?.personIds, job.name) ||
      identityReferenceUrl(opts.library, job.name)
    if (!front) return { ...opts, didDe: `Stammbild von ${job.name} fehlt noch.` }
    const drawn = await generateStoryCharacter(
      `${look}\nSame person as the attached photo. Three-quarter view, full body. Same face, hair and clothes.\n${CHARACTER_REFERENCE_LINE}`,
      job.name,
      styleId,
      'standing-left',
      'front-left',
      'relaxed',
      front,
      undefined,
      'standing-three-quarter',
      false,
      false,
    )
    const saved = await saveStoryAsset(opts.userId, {
      type: 'character',
      name: job.name,
      description: look,
      imageUrl: drawn.imageUrl,
      tags: [REFERENCE_TAG, 'ansicht:seite', 'standing-three-quarter', ...(styleId ? [`stil:${styleId}`] : [])],
      styleId,
      prompt: drawn.prompt,
      legPoseId: 'standing-left',
      headAngleId: 'front-left',
      armPoseId: 'relaxed',
    })
    return {
      library: [saved, ...opts.library],
      continuity: opts.continuity,
      didDe: `Seitenansicht von ${job.name} gezeichnet. Sie wird mit dem Stammbild verglichen.`,
    }
  }
  if (job.kind === 'person-check') {
    const front =
      pickedCastUrl(opts.library, opts.picks?.personIds, job.name) ||
      identityReferenceUrl(opts.library, job.name)
    const side = sidePlate(opts.library, job.name)
    const tried = hasName(opts.continuity.sideTries, job.name)
    const ok = front && side?.imageUrl ? await samePerson(front, side.imageUrl) : true
    if (ok !== false || tried) {
      return {
        library: opts.library,
        continuity: {
          ...opts.continuity,
          sideChecked: [...(opts.continuity.sideChecked ?? []), job.name],
        },
        didDe:
          ok === false
            ? `Seitenansicht von ${job.name} bleibt. Der zweite Versuch war nah genug.`
            : `Seitenansicht von ${job.name} passt zum Stammbild.`,
      }
    }
    if (side) {
      const tags = (side.tags ?? []).filter((tag) => tag !== 'ansicht:seite')
      await setStoryAssetTags(opts.userId, side.id, [...tags, 'ansicht:verworfen'])
    }
    return {
      library: opts.library.map((asset) =>
        asset.id === side?.id
          ? { ...asset, tags: [...(asset.tags ?? []).filter((tag) => tag !== 'ansicht:seite'), 'ansicht:verworfen'] }
          : asset,
      ),
      continuity: {
        ...opts.continuity,
        sideTries: [...(opts.continuity.sideTries ?? []), job.name],
      },
      didDe: `Seitenansicht von ${job.name} passte nicht. Sie wird noch einmal gezeichnet.`,
    }
  }
  const place = opts.continuity.places.find((item) => item.name.trim().toLowerCase() === job.name.trim().toLowerCase())
  const drawn = await generateStoryEnvironment(place?.lookEn || job.name, job.name, styleId)
  const saved = await saveStoryAsset(opts.userId, {
    type: 'environment',
    name: job.name,
    description: place?.lookEn || job.name,
    imageUrl: drawn.imageUrl,
    tags: roomPlateTags(styleId, place?.lookEn || job.name),
    styleId,
    prompt: drawn.prompt,
  })
  return {
    library: [saved, ...opts.library],
    continuity: opts.continuity,
    didDe: `Raum ${job.name} als Referenz gezeichnet.`,
  }
}

export function stampReferenceFaces(
  panel: FilmStoryboardPanel,
  library: StoryLibraryAsset[],
  pickedIds?: string[],
): FilmStoryboardPanel {
  return {
    ...panel,
    placements: panel.placements.map((placement) => {
      const url = pickedCastUrl(library, pickedIds, placement.name) || identityReferenceUrl(library, placement.name)
      if (!url) return placement
      return { ...placement, imageUrl: url }
    }),
  }
}
