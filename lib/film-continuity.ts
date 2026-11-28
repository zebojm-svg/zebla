import { regieJson } from './ai.js'
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
  fallbackShots,
  referenceJobs,
  regiebuchFromContinuity,
  regiebuchVorgabenDe,
  type RegiebuchEdit,
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
PERSONEN — nur was man sieht. lookEn und lookDe beschreiben ausschliesslich das Aussehen, so dass ein Maler die Person jedes Mal gleich zeichnet:
- Alter (ungefähr), Mann oder Frau,
- Haare: Farbe, Länge, Frisur,
- Hautfarbe,
- Kleidung mit Farben (Oberteil, Hose oder Rock, Schuhe, wenn man sie sieht),
- Brille, Schmuck, und was die Person trägt oder in der Hand hat.
Charakter, Laune, Hobbys und was die Person tut gehören NICHT in lookEn oder lookDe (nicht «freundlich», nicht «spielt gern Gitarre»). Steht im Dialog nichts zum Aussehen, erfinde ein passendes, festes Aussehen.
Keine bekannte Figur aus einem Buch oder Film.
lookDe ist derselbe Inhalt auf Deutsch, in einfachen Sätzen. Jean-Marie liest ihn im Regiebuch.
ORTE — konkret und unverwechselbar. lookEn und lookDe nennen bestimmte Möbel, Farben (Wände, Boden, Möbel) und Licht.
Beschreibe jeden Ort so, dass man ihn aus jeder Richtung zeichnen kann: Wand für Wand, was an welcher Wand ist (Fenster, Tür, Regal, Bild, Möbel), wo die Person sitzt oder steht und in welche Richtung sie schaut.
Ist eine Person an einem anderen Ort als die andere, bekommt jeder Ort einen eigenen Eintrag mit eigenem Namen.
Zwei verschiedene Orte dürfen nie dieselbe Beschreibung haben. Gib jedem Ort andere Wandfarben, andere Möbel und eine andere Anordnung, so dass man auf einem Bild sofort erkennt, welcher Ort es ist. «Hell und freundlich» allein beschreibt keinen Ort.
Kamera-Regeln für alle Bilder: Ein Gegenschuss zeigt die gegenüberliegende Wand. Die Leute schauen ihr Gegenüber oder das an, womit sie gerade beschäftigt sind, nicht den Zuschauer, ausser der Satz spricht den Zuschauer an.
Stehen VORGABEN VON JEAN-MARIE unter der Geschichte, gelten sie. Sie gehen dem Dialog vor, wo sie sich widersprechen.
Nur JSON:
{
  "situationDe": "ein deutscher Satz",
  "situationEn": "one English paragraph for the painter",
  "together": true,
  "people": [{ "name": "Lena", "lookEn": "woman about 30, light skin, short dark brown bob, round black glasses, green wool coat over a white shirt, blue jeans", "lookDe": "Frau um 30, helle Haut, kurzer dunkelbrauner Bob, runde schwarze Brille, grüner Wollmantel über weissem Hemd, blaue Jeans" }],
  "places": [{ "name": "Küche", "lookEn": "kitchen with yellow walls and grey tiled floor. Left wall: white gas stove and a shelf with red pots. Back wall: window to the street with blue curtains. Right wall: wooden door. Round wooden table in the middle; Lena sits on its far side facing the window.", "lookDe": "Küche mit gelben Wänden und grauem Fliesenboden. Linke Wand: weisser Gasherd, Regal mit roten Töpfen. Hintere Wand: Fenster zur Strasse mit blauen Vorhängen. Rechte Wand: Holztür. Runder Holztisch in der Mitte; Lena sitzt auf der hinteren Seite und schaut zum Fenster." }],
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

function panelsForContinuity(board?: FilmStoryboard) {
  return (board?.panels ?? []).map((panel) => ({
    id: panel.id,
    shot: panel.shot,
    settingHint: panel.settingHint,
    closeupSpeaker: panel.closeupSpeaker,
  }))
}

/** Ein schon gemaltes Bild, das die Regie beim Neu-Lesen ansieht. */
export interface RegiebuchStill {
  url: string
  aboutDe: string
}

export const REGIEBUCH_STILLS_MAX = 4

async function readStory(
  dialog: Dialog,
  board: FilmStoryboard | undefined,
  vorgabenDe: string,
  stills: RegiebuchStill[] = [],
): Promise<FilmContinuity | null> {
  const text = storyTextForContinuity(dialog, board)
  const images: Array<{ mimeType: string; data: string }> = []
  const legend: string[] = []
  for (const still of stills.slice(0, REGIEBUCH_STILLS_MAX)) {
    const part = await imagePart(still.url)
    if (!part) continue
    images.push(part)
    legend.push(`Bild ${images.length}: ${still.aboutDe}`)
  }
  const ask = [
    text,
    vorgabenDe.trim() ? `VORGABEN VON JEAN-MARIE:\n${vorgabenDe}` : '',
    legend.length
      ? `SCHON GEMALTE BILDER (angehängt, von der Regie gutgeheissen):\n${legend.join('\n')}\nNimm das Aussehen der Leute und Orte aus diesen Bildern, damit das Regiebuch zum Gemalten passt. Vorgaben von Jean-Marie gehen vor.`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  try {
    const raw = await regieJson<unknown>(SYSTEM, ask, images, {
      temperature: 0.2,
      timeoutMs: 75_000,
      timeoutMessage: 'Die Regie hat die Geschichte nicht rechtzeitig gelesen.',
    })
    const clean = sanitizeContinuity(raw, text, panelsForContinuity(board))
    return clean ? { ...clean, sourceKey: continuitySourceKey(text) } : null
  } catch {
    return null
  }
}

export async function ensureFilmContinuity(
  dialog: Dialog,
  board?: FilmStoryboard,
  opts?: { fresh?: boolean; stills?: RegiebuchStill[] },
): Promise<FilmContinuity> {
  const text = storyTextForContinuity(dialog, board)
  const key = continuitySourceKey(text)
  const panels = panelsForContinuity(board)
  const cached = board?.continuity
  if (
    !opts?.fresh &&
    cached?.sourceKey === key &&
    cached.situationEn &&
    (panels.length === 0 || (cached.shots?.length ?? 0) > 0)
  ) {
    return cached
  }
  const keep = {
    sideChecked: cached?.sideChecked,
    sideTries: cached?.sideTries,
    ...(cached?.byUser ? { byUser: true, notesDe: cached.notesDe } : {}),
  }
  const vorgaben = cached?.byUser ? regiebuchVorgabenDe(regiebuchFromContinuity(cached)) : ''
  const read = await readStory(dialog, board, vorgaben, opts?.stills)
  if (read) return { ...read, ...keep }
  if (cached?.byUser) return { ...cached, sourceKey: key, shots: fallbackShots(panels) }
  return {
    ...fallbackContinuity({ text, people: peopleInDialog(dialog), places: placesOnBoard(board), panels }),
    ...keep,
  }
}

/** Jean-Marie hat das Regiebuch geändert. Die Regie liest die Geschichte mit seinen Sätzen als Vorgabe neu. */
export async function applyRegiebuchEdit(
  dialog: Dialog,
  board: FilmStoryboard,
  edit: RegiebuchEdit,
): Promise<FilmContinuity> {
  const read = await readStory(dialog, board, regiebuchVorgabenDe(edit))
  if (!read) throw new Error('Die Regie konnte das Regiebuch nicht übernehmen. Bitte noch einmal speichern.')
  return {
    ...read,
    sideChecked: board.continuity?.sideChecked,
    sideTries: board.continuity?.sideTries,
    byUser: true,
    notesDe: edit.notesDe,
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

export function placePlate(library: StoryLibraryAsset[], name: string): StoryLibraryAsset | undefined {
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

export interface RegieVerdict {
  ok: boolean
  noteDe: string
  fixEn: string
  /** Das Bild hat Dinge aus einem falschen früheren Bild übernommen: beim nächsten Versuch ohne Ortsbilder. */
  freshRefs: boolean
}

const JUDGE = `Du bist die Regie einer Bildergeschichte. Du siehst das neue Bild, dein Regiebuch und den Satz aus dem Dialog.
Du urteilst nur daraus. Es gibt keine Liste von Orten, Tieren oder Geräten. Was hier gilt, steht im Regiebuch und im Satz.
Prüfe der Reihe nach:
1. Jede Person ist höchstens einmal zu sehen. Auch nicht zusätzlich auf einem zweiten Bildschirm, in einem eingeblendeten Fenster oder als Doppelgänger, ausser der Satz will das.
2. Nur wer laut Regiebuch und Plan der Regie in diesem Moment an diesem Ort ist, ist körperlich hier. Wer laut Plan nur auf einem Bildschirm ist, ist nicht als Körper im Raum. Keine fremde Person, die im Regiebuch nicht vorkommt.
3. Gesicht, Haare, Kleidung und Dinge am Körper wie im Regiebuch und wie auf den früheren Bildern derselben Person.
4. Der Ort sieht aus wie im Regiebuch und im Plan. Dinge, die zu einem anderen Ort gehören, tauchen hier nicht auf. Ist es der Raum eines anderen Ortes, ist das ein Fehler, und freshRefs ist true. Vergleiche mit den früheren Bildern, die als «anderer Ort» bezeichnet sind: gleiche Möbel, gleiche Dinge an der Wand, gleiche Fenster hinter einer Person heissen, dass sie im falschen Raum ist. Das gilt auch für jemanden auf einem Bildschirm: er sitzt vor seinem eigenen Raum, nicht vor dem Raum einer anderen Person.
5. Die Einstellung passt zum Satz und zum Plan: nah heisst, diese Person füllt das Bild.
6. Unlesbare Fantasie-Schrift auf Zetteln, Schildern oder Bildschirmen ist ein Fehler, ausser der Satz braucht Schrift.
7. Die Leute posieren nicht für den Zuschauer. Sie schauen ihr Gegenüber an oder das, womit sie beschäftigt sind, ausser der Satz spricht den Zuschauer an.
8. Der Hintergrund passt zur Blickrichtung der Kamera und zur Beschreibung des Ortes: schaut die Kamera in die andere Richtung als auf einem früheren Bild am selben Ort, ist die gegenüberliegende Wand zu sehen.
Licht und Gesichtsausdruck sind frei, solange sie zum Satz passen.
JSON: { "ok": true, "noteDe": "", "fixEn": "", "freshRefs": false }
ok ist false nur bei einem klaren Fehler aus der Liste.
noteDe: ein kurzer deutscher Satz für Jean-Marie, was falsch ist (leer wenn ok).
fixEn: was der Maler beim nächsten Versuch anders machen muss, englisch, konkret, mit Namen.
freshRefs ist true, wenn das neue Bild Dinge aus einem der früheren Bilder übernommen hat, die nicht hierher gehören.`

/**
 * Die Regie schaut das fertige Bild an und vergleicht es mit Regiebuch, Satz und früheren Bildern.
 * Kein fester Satz für Videochat, See oder Ente — nur dieses Regiebuch und dieses Bild.
 */
export async function judgeStoryStill(opts: {
  imageUrl: string
  regiebuchDe: string
  lineDe: string
  shotDe: string
  refs: Array<{ url: string; roleDe: string }>
}): Promise<RegieVerdict> {
  const pass: RegieVerdict = { ok: true, noteDe: '', fixEn: '', freshRefs: false }
  const still = await imagePart(opts.imageUrl)
  if (!still) return pass
  const refs: Array<{ part: { mimeType: string; data: string }; roleDe: string }> = []
  for (const ref of opts.refs.slice(0, 4)) {
    const part = await imagePart(ref.url)
    if (part) refs.push({ part, roleDe: ref.roleDe })
  }
  const legend = [
    'Bild 1: das neue Bild.',
    ...refs.map((ref, index) => `Bild ${index + 2}: ${ref.roleDe}`),
  ].join('\n')
  try {
    const raw = await regieJson<{ ok?: boolean; noteDe?: string; fixEn?: string; freshRefs?: boolean }>(
      JUDGE,
      `REGIEBUCH:\n${opts.regiebuchDe || '—'}\n\nEINSTELLUNG / PLAN: ${opts.shotDe}\nSATZ ZU DIESEM BILD: ${opts.lineDe || '—'}\n\n${legend}`,
      [still, ...refs.map((ref) => ref.part)],
      { temperature: 0.1, timeoutMs: 90_000, timeoutMessage: 'Die Regie hat das Bild nicht rechtzeitig angeschaut.' },
    )
    const ok = raw.ok !== false
    const noteDe = typeof raw.noteDe === 'string' ? raw.noteDe.trim().slice(0, 240) : ''
    const fixEn = typeof raw.fixEn === 'string' ? raw.fixEn.trim().slice(0, 500) : ''
    return ok ? pass : { ok, noteDe: noteDe || 'Das Bild passt nicht zum Regiebuch.', fixEn, freshRefs: raw.freshRefs === true }
  } catch {
    return pass
  }
}

async function samePerson(frontUrl: string, sideUrl: string): Promise<boolean | null> {
  const front = await imagePart(frontUrl)
  const side = await imagePart(sideUrl)
  if (!front || !side) return null
  try {
    const raw = await regieJson<{ ok?: boolean }>(
      'Du vergleichst zwei Bilder. JSON: { "ok": true }. ok ist true, wenn es dieselbe Person ist: gleiches Gesicht, gleiche Haarfarbe, gleiche Kleidung. Eine andere Blickrichtung ist in Ordnung. ok ist false, wenn es klar eine andere Person ist.',
      'Erstes Bild: Stammbild von vorne. Zweites Bild: Seitenansicht. Ist es dieselbe Person?',
      [front, side],
      { temperature: 0.1, timeoutMs: 45_000, timeoutMessage: 'Der Vergleich hat zu lange gebraucht.' },
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
