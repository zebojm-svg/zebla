import { regieJson, regieJsonWithModel } from './ai.js'
import { imagePartFromUrl, type InlinePart } from './film-image-parts.js'
import { readJudgeAnswer, REGIE_CHECKS, uncheckedVerdict, type RegieVerdict } from '../shared/film-regie-judge.js'
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
  continuityProblemDe,
  continuitySourceKey,
  isRegieReading,
  fallbackContinuity,
  fallbackShots,
  placesTooAlike,
  referenceJobs,
  regiebuchFromContinuity,
  regiebuchVorgabenDe,
  type RegiebuchEdit,
  sanitizeContinuity,
  type FilmContinuity,
  type FilmRefJob,
} from '../shared/film-continuity.js'
import { lineStoryText } from '../shared/film-dialog-native.js'
import {
  readRoomPlateAnswer,
  roomPlateFor,
  roomPlateNeedsRedraw,
  withRoomPlate,
  type FilmRoomPlate,
} from '../shared/film-room-plate.js'

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
Beschreibe jeden Ort so, dass man ihn aus jeder Richtung zeichnen kann: Wand für Wand, was an welcher Wand ist (Fenster, Tür, Regal, Bild, Möbel).
Ein Ort ist der LEERE Raum: keine Namen von Personen, keine Leute, nicht wer wo sitzt, steht oder hinschaut. Das entscheidet später der Plan für jedes einzelne Bild.
Ein Raum ist genau EIN Ort. Ein Gegenstand, ein Detail oder eine andere Blickrichtung im selben Raum (eine Karte an der Wand, das Fenster, der Schreibtisch) ist kein eigener Ort; es steht in der Beschreibung dieses Raums. Die Ortsangaben bei den Bildern («Bild … | …») sind nur Hinweise vom Storyboard: gehören zwei Angaben zum selben Raum, ist es ein Ort mit einem Namen. Ein Bildschirm, auf dem man eine andere Person oder eine Seite sieht, darf ein eigener Ort sein.
Ist eine Person an einem anderen Ort als die andere, bekommt jeder Ort einen eigenen Eintrag mit eigenem Namen.
Zwei verschiedene Orte dürfen nie dieselbe Beschreibung haben, ausser die Geschichte sagt, dass es derselbe Raum ist. Gib jedem Ort eine andere Wandfarbe, einen anderen Boden, das Fenster an einer anderen Wand, die Möbel auf der anderen Seite und eigene, auffällige Dinge, so dass man auf einem Bild sofort erkennt, welcher Ort es ist. «Hell und freundlich» allein beschreibt keinen Ort.
Angehängte Bilder und Raum-Vorlagen können falsch sein: oft hat der Maler einen Raum in den anderen kopiert. Sehen zwei Orte auf den Bildern gleich aus, ist das ein Fehler der Bilder; übernimm ihn nicht, sondern mach die Orte verschieden.
Kamera-Regeln für alle Bilder: Ein Gegenschuss zeigt die gegenüberliegende Wand. Die Leute schauen ihr Gegenüber oder das an, womit sie gerade beschäftigt sind, nicht den Zuschauer, ausser der Satz spricht den Zuschauer an.
Stehen VORGABEN VON JEAN-MARIE unter der Geschichte, gelten sie. Sie gehen dem Dialog vor, wo sie sich widersprechen.
Nur JSON:
{
  "situationDe": "ein deutscher Satz",
  "situationEn": "one English paragraph for the painter",
  "together": true,
  "people": [{ "name": "Lena", "lookEn": "woman about 30, light skin, short dark brown bob, round black glasses, green wool coat over a white shirt, blue jeans", "lookDe": "Frau um 30, helle Haut, kurzer dunkelbrauner Bob, runde schwarze Brille, grüner Wollmantel über weissem Hemd, blaue Jeans" }],
  "places": [{ "name": "Küche", "lookEn": "kitchen with yellow walls and grey tiled floor. Left wall: white gas stove and a shelf with red pots. Back wall: window to the street with blue curtains. Right wall: wooden door. Round wooden table with three chairs in the middle.", "lookDe": "Küche mit gelben Wänden und grauem Fliesenboden. Linke Wand: weisser Gasherd, Regal mit roten Töpfen. Hintere Wand: Fenster zur Strasse mit blauen Vorhängen. Rechte Wand: Holztür. Runder Holztisch mit drei Stühlen in der Mitte." }],
  "locksEn": ["same green coat in every frame"],
  "shots": [
    { "panelId": "die echte Bild-id", "viewKey": "kueche|weit", "sendViewKeys": [], "whyDe": "erster Blick auf die Küche" }
  ]
}
places.name ist ein oder zwei Wörter. whyDe hat höchstens sechs Wörter.
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

/** Automatisch (vor Bildern): kurz, weil danach noch gemalt wird. Auf Knopfdruck im Regiebuch: fast die ganzen 180 s. */
export const REGIEBUCH_AUTO_BUDGET_MS = 75_000
export const REGIEBUCH_BUTTON_BUDGET_MS = 150_000
const REPAIR_MIN_MS = 45_000

export type ContinuityRead =
  | { continuity: FilmContinuity; errorDe?: undefined }
  | { continuity?: undefined; errorDe: string }

/** Die Regie liest. Gelingt es nicht, kommt ein deutscher Grund zurück — nie still ein Ersatz-Regiebuch. */
async function readStory(
  dialog: Dialog,
  board: FilmStoryboard | undefined,
  vorgabenDe: string,
  opts: { stills?: RegiebuchStill[]; budgetMs?: number } = {},
): Promise<ContinuityRead> {
  const started = Date.now()
  const budget = opts.budgetMs ?? REGIEBUCH_AUTO_BUDGET_MS
  const text = storyTextForContinuity(dialog, board)
  const picked = (opts.stills ?? []).slice(0, REGIEBUCH_STILLS_MAX)
  const parts = await Promise.all(picked.map((still) => imagePart(still.url, 8_000)))
  const images: Array<{ mimeType: string; data: string }> = []
  const legend: string[] = []
  parts.forEach((part, index) => {
    if (!part) return
    images.push(part)
    legend.push(`Bild ${images.length}: ${picked[index]!.aboutDe}`)
  })
  const ask = [
    text,
    vorgabenDe.trim() ? `VORGABEN VON JEAN-MARIE:\n${vorgabenDe}` : '',
    legend.length
      ? `SCHON GEMALTE BILDER (angehängt, von der Regie gutgeheissen):\n${legend.join('\n')}\nNimm das Aussehen der Leute aus diesen Bildern, damit das Regiebuch zum Gemalten passt. Räume nur, wenn sie zur Geschichte passen: sehen zwei verschiedene Orte auf den Bildern gleich aus, hat der Maler kopiert — beschreibe sie trotzdem verschieden. Vorgaben von Jean-Marie gehen vor.`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  const panels = panelsForContinuity(board)
  const askRegie = async (extra: string, timeoutMs: number) => {
    try {
      const read = await regieJsonWithModel<unknown>(SYSTEM, extra ? `${ask}\n\n${extra}` : ask, images, {
        temperature: 0.2,
        timeoutMs,
        timeoutMessage: `Die Regie hat länger als ${Math.round(timeoutMs / 1000)} Sekunden gebraucht`,
      })
      const raw = read.value
      const answer = Array.isArray(raw) ? raw.find((item) => item && typeof item === 'object') : raw
      const clean = sanitizeContinuity(answer, text, panels)
      return clean
        ? {
            continuity: {
              ...clean,
              sourceKey: continuitySourceKey(text),
              readModel: read.model,
              ...(read.noteDe ? { readModelNoteDe: read.noteDe } : {}),
            },
          }
        : { errorDe: continuityProblemDe(answer) }
    } catch (err) {
      const message = err instanceof Error ? err.message.trim() : ''
      return { errorDe: message.slice(0, 200) || 'Die Regie hat nicht geantwortet', failed: true }
    }
  }
  const first = await askRegie('', budget - (Date.now() - started))
  if (first.continuity) {
    const alike = placesTooAlike(first.continuity.places)
    const room = budget - (Date.now() - started)
    if (!alike.length || room < REPAIR_MIN_MS) return { continuity: first.continuity }
    const pairs = alike.map(([a, b]) => `«${a}» und «${b}»`).join(', ')
    const better = await askRegie(
      `DEINE LETZTE ANTWORT: die Orte ${pairs} sind fast gleich beschrieben. Es sind verschiedene Räume. Schreib das ganze JSON noch einmal und mach sie klar verschieden: andere Wandfarbe, anderer Boden, Fenster an einer anderen Wand, Möbel auf der anderen Seite, eigene auffällige Dinge.`,
      room - 3_000,
    )
    return { continuity: better.continuity ?? first.continuity }
  }
  const left = budget - (Date.now() - started)
  if ('failed' in first || left < REPAIR_MIN_MS) return { errorDe: first.errorDe as string }
  const again = await askRegie(
    `DEINE LETZTE ANTWORT WAR UNVOLLSTÄNDIG: ${first.errorDe}. Antworte noch einmal, nur mit dem ganzen JSON-Objekt. Halte dich kurz.`,
    left - 3_000,
  )
  return again.continuity ? { continuity: again.continuity } : { errorDe: again.errorDe as string }
}

/** Das Regiebuch passt noch zur Geschichte: nicht neu lesen. */
export function continuityIsCurrent(dialog: Dialog, board?: FilmStoryboard): boolean {
  const cached = board?.continuity
  const panels = panelsForContinuity(board)
  return Boolean(
    cached?.sourceKey === continuitySourceKey(storyTextForContinuity(dialog, board)) &&
      cached.situationEn &&
      (panels.length === 0 || (cached.shots?.length ?? 0) > 0),
  )
}

function keepFromCached(cached?: FilmContinuity) {
  return {
    sideChecked: cached?.sideChecked,
    sideTries: cached?.sideTries,
    ...(cached?.plates?.length ? { plates: cached.plates } : {}),
    ...(cached?.byUser ? { byUser: true, notesDe: cached.notesDe } : {}),
  }
}

/** Lesen misslungen: ein echtes Regiebuch bleibt, nur neue Bilder bekommen einfache Blicke. */
function keepOldReading(cached: FilmContinuity, key: string, panels: ReturnType<typeof panelsForContinuity>): FilmContinuity {
  return {
    ...cached,
    sourceKey: key,
    shots: fallbackShots(panels).map((shot) => cached.shots?.find((have) => have.panelId === shot.panelId) ?? shot),
  }
}

/** Wie ensureFilmContinuity, sagt aber, ob und warum das Lesen misslang. */
export async function ensureFilmContinuityRead(
  dialog: Dialog,
  board?: FilmStoryboard,
  opts?: { budgetMs?: number },
): Promise<{ continuity: FilmContinuity; read: boolean; errorDe?: string }> {
  const cached = board?.continuity
  if (cached && continuityIsCurrent(dialog, board)) return { continuity: cached, read: false }
  const text = storyTextForContinuity(dialog, board)
  const key = continuitySourceKey(text)
  const panels = panelsForContinuity(board)
  const vorgaben = cached?.byUser ? regiebuchVorgabenDe(regiebuchFromContinuity(cached)) : ''
  const got = await readStory(dialog, board, vorgaben, { budgetMs: opts?.budgetMs })
  if (got.continuity) return { continuity: { ...got.continuity, ...keepFromCached(cached) }, read: true }
  if (cached && isRegieReading(cached)) {
    return { continuity: keepOldReading(cached, key, panels), read: true, errorDe: got.errorDe }
  }
  return {
    continuity: {
      ...fallbackContinuity({ text, people: peopleInDialog(dialog), places: placesOnBoard(board), panels }),
      ...keepFromCached(cached),
    },
    read: true,
    errorDe: got.errorDe,
  }
}

export async function ensureFilmContinuity(dialog: Dialog, board?: FilmStoryboard): Promise<FilmContinuity> {
  return (await ensureFilmContinuityRead(dialog, board)).continuity
}

/** «Neu lesen» im Regiebuch. Misslingt es, bleibt das bisherige Regiebuch, und der Grund kommt zurück. */
export async function rereadFilmContinuity(
  dialog: Dialog,
  board: FilmStoryboard,
  opts?: { stills?: RegiebuchStill[] },
): Promise<ContinuityRead> {
  const cached = board.continuity
  const vorgaben = cached?.byUser ? regiebuchVorgabenDe(regiebuchFromContinuity(cached)) : ''
  const got = await readStory(dialog, board, vorgaben, { stills: opts?.stills, budgetMs: REGIEBUCH_BUTTON_BUDGET_MS })
  return got.continuity ? { continuity: { ...got.continuity, ...keepFromCached(cached) } } : got
}

/** Jean-Marie hat das Regiebuch geändert. Die Regie liest die Geschichte mit seinen Sätzen als Vorgabe neu. */
export async function applyRegiebuchEdit(
  dialog: Dialog,
  board: FilmStoryboard,
  edit: RegiebuchEdit,
): Promise<ContinuityRead> {
  const got = await readStory(dialog, board, regiebuchVorgabenDe(edit), { budgetMs: REGIEBUCH_BUTTON_BUDGET_MS })
  if (!got.continuity) return got
  return {
    continuity: {
      ...got.continuity,
      sideChecked: board.continuity?.sideChecked,
      sideTries: board.continuity?.sideTries,
      plates: platesAfterEdit(board.continuity, edit),
      byUser: true,
      notesDe: edit.notesDe,
    },
  }
}

/** Hat Jean-Marie die Beschreibung eines Ortes geändert, muss sein Raumbild neu: es zeigt sonst die alte Einrichtung. */
function platesAfterEdit(cached: FilmContinuity | undefined, edit: RegiebuchEdit): FilmRoomPlate[] | undefined {
  const plates = cached?.plates
  if (!plates?.length) return undefined
  const kept = plates.filter((plate) => {
    const before = cached?.places.find((place) => place.name.trim().toLowerCase() === plate.place.trim().toLowerCase())
    const after = edit.places.find((place) => place.name.trim().toLowerCase() === plate.place.trim().toLowerCase())
    if (!after) return true
    return (before?.lookDe ?? '').trim() === after.lookDe.trim()
  })
  return kept.length ? kept : undefined
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

async function imagePart(url: string, timeoutMs?: number): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(url, timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : undefined)
    if (!res.ok) return null
    const data = Buffer.from(await res.arrayBuffer()).toString('base64')
    const mime = (res.headers.get('content-type') || 'image/png').split(';')[0] || 'image/png'
    return { mimeType: mime, data }
  } catch {
    return null
  }
}

export type { RegieVerdict } from '../shared/film-regie-judge.js'

const JUDGE = `Du bist die Regie einer Bildergeschichte. Du prüfst ein frisch gemaltes Bild (Bild 1), bevor es in den Film kommt.
Du urteilst nur aus Regiebuch, Plan, den Sätzen und den angehängten Bildern. Es gibt keine festen Regeln für bestimmte Orte, Tiere oder Geräte.
Sei streng wie ein aufmerksamer Zuschauer: was er sofort als falsch sieht, ist ein Fehler. Licht, kleine Möbeldetails und der genaue Gesichtsausdruck sind frei, solange sie zum Satz passen.

SCHRITT 1 — HINSCHAUEN. Beschreibe nüchtern, was auf Bild 1 wirklich zu sehen ist, bevor du urteilst. Nicht was zu sehen sein sollte.
- people: jede Person (auch halb, am Rand, im Hintergrund, auf einer Fläche), mit Haaren und Kleidung
- bodyParts: jede sichtbare Hand, jeder Arm, jedes Bein, jeder Fuss, jeder Kopf, und zu wem es gehört. Gehört etwas zu niemandem, schreib das.
- surfaces: Bildschirme, Fernseher, Telefone, Spiegel, Tafeln, Bilder an der Wand, und was darauf zu sehen ist. Ein Bild oder Fenster, das frei in der Luft schwebt, nennst du extra.
- place: Wände (Farbe), Boden, Fenster, Türen, jedes Möbelstück mit Anzahl (zwei gleiche = zwei), auffällige Dinge, und wo im Bild sie sind (an welcher Wand, gerade oder schräg)
- camera: von wo die Kamera schaut (von vorne, von der Seite, von hinten) und wie nah
- gaze: wohin jede Person schaut
- action: was die Leute gerade tun

SCHRITT 2 — PRÜFEN. Vergleiche deine Beschreibung mit Regiebuch, Plan, Sätzen und den anderen Bildern. Beantworte jede Prüfung mit pass true oder false:
${REGIE_CHECKS.map((rule) => `- ${rule.id}: ${rule.askDe}`).join('\n')}

Deine eigene Beschreibung aus Schritt 1 gilt. Widerspricht sie dem Plan (Kamera von einer anderen Seite, Möbel an einer anderen Wand, eine Person mehr oder weniger), muss die passende Prüfung false sein. Im Zweifel false, mit kurzem Grund.
Der Ort der Kamera ist der Raum um die Leute und um die Geräte. Was auf einer Fläche (Bildschirm, Spiegel, Tafel) zu sehen ist, gehört zum Ort, den der Plan für diese Fläche nennt. Ein Raum um ein Gerät ist kein Fehler, nur weil auf dem Gerät ein anderer Ort zu sehen ist.
Das vorige Bild und frühere Bilder sind zum Vergleichen da. Sie können selbst falsch sein; massgebend sind Regiebuch und Plan.

Nur JSON:
{ "seen": { "people": "", "bodyParts": "", "surfaces": "", "place": "", "camera": "", "gaze": "", "action": "" },
  "compare": { "planCamera": "", "seenCamera": "", "same": true },
  "checks": [{ "id": "personen", "pass": true, "noteDe": "" }],
  "fixEn": "", "freshRefs": false }
compare: planCamera = von wo die Kamera laut Plan schaut (von vorne, von der Seite, von hinten), seenCamera = von wo sie auf Bild 1 wirklich schaut, same = ob das übereinstimmt.
checks enthält jede Prüfung genau einmal, mit ihrer id.
noteDe nur bei pass false: ein kurzer deutscher Satz für Jean-Marie, ohne Fachwörter, was falsch ist.
fixEn: was der Maler beim nächsten Versuch anders machen muss, englisch, konkret, mit Namen, nur zu den nicht bestandenen Prüfungen.
freshRefs ist true, wenn das Bild den Raum oder Dinge aus einem früheren Bild eines anderen Ortes übernommen hat.`

/** Die Regie schaut sich ein Bild höchstens so lange an; danach bleibt Zeit für Laden und Speichern (180 s je Anfrage). */
export const JUDGE_TIMEOUT_MS = 110_000
/** Vorlagen für das Urteil: verkleinert, damit es billig und schnell bleibt. */
export const JUDGE_REF_WIDTH = 768
export const JUDGE_MAX_REFS = 6

/**
 * Die Regie schaut das fertige Bild an: zuerst beschreiben, dann jede Prüfung mit ja oder nein.
 * Kann sie nicht prüfen (Bild fehlt, Fehler, Zeitlimit), heisst das «nicht geprüft» — nie still «passt».
 */
export async function judgeStoryStill(opts: {
  imageUrl: string
  regiebuchDe: string
  linesDe: { before: string; now: string; after: string }
  planDe: string
  paintEn?: string
  /** Kamera laut Plan (deutsch und englisch), für den Abgleich mit dem, was die Regie sieht. */
  plannedCameraText?: string
  refs: Array<{ url: string; roleDe: string }>
}): Promise<RegieVerdict> {
  const picked = opts.refs.slice(0, JUDGE_MAX_REFS)
  const [still, ...parts] = await Promise.all([
    imagePartFromUrl(opts.imageUrl, { timeoutMs: 15_000 }),
    ...picked.map((ref) => imagePartFromUrl(ref.url, { timeoutMs: 8_000, maxWidth: JUDGE_REF_WIDTH })),
  ])
  if (!still) return uncheckedVerdict('Das Bild konnte nicht geladen werden')
  const refs: Array<{ part: InlinePart; roleDe: string }> = []
  parts.forEach((part, index) => {
    if (part) refs.push({ part, roleDe: picked[index]!.roleDe })
  })
  const legend = ['Bild 1: das neue Bild, das du prüfst.', ...refs.map((ref, index) => `Bild ${index + 2}: ${ref.roleDe}`)].join('\n')
  const ask = [
    `REGIEBUCH:\n${opts.regiebuchDe || '—'}`,
    `PLAN DER REGIE FÜR DIESES BILD: ${opts.planDe}`,
    opts.paintEn ? `AUFTRAG AN DEN MALER (englisch): ${opts.paintEn}` : '',
    `SATZ DAVOR: ${opts.linesDe.before || '—'}`,
    `SATZ ZU DIESEM BILD: ${opts.linesDe.now || '—'}`,
    `SATZ DANACH: ${opts.linesDe.after || '—'}`,
    'Was erst im Satz danach passiert, muss hier noch nicht zu sehen sein.',
    legend,
  ]
    .filter(Boolean)
    .join('\n\n')
  try {
    const { value, model, noteDe } = await regieJsonWithModel<unknown>(JUDGE, ask, [still, ...refs.map((ref) => ref.part)], {
      temperature: 0.1,
      timeoutMs: JUDGE_TIMEOUT_MS,
      timeoutMessage: 'Die Regie hat das Bild nicht rechtzeitig angeschaut',
    })
    return readJudgeAnswer(value, model, { plannedViewText: opts.plannedCameraText, modelNoteDe: noteDe })
  } catch (err) {
    const message = err instanceof Error ? err.message.trim() : ''
    return uncheckedVerdict(message.slice(0, 160) || 'Die Regie hat nicht geantwortet')
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
    hasPlace: (name) => Boolean(roomPlateUrl(continuity, library, picks, name)),
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
  const lookEn = place?.lookEn || job.name
  if (job.kind === 'place-check') {
    const plate = roomPlateFor(opts.continuity.plates, job.name)
    if (!plate) return { ...opts, didDe: `Raumbild «${job.name}» fehlt noch.` }
    const checked = await judgeRoomPlate({ url: plate.url, name: job.name, lookEn })
    const next: FilmRoomPlate = checked
      ? { ...plate, checked: true, ok: checked.ok, noteDe: checked.noteDe, fixEn: checked.fixEn, model: checked.model }
      : { ...plate, checked: true, ok: true, noteDe: 'Die Regie konnte das Raumbild nicht anschauen; es bleibt.' }
    return {
      library: opts.library,
      continuity: { ...opts.continuity, plates: withRoomPlate(opts.continuity.plates, next) },
      didDe: !checked
        ? `Raumbild «${job.name}»: die Regie konnte es nicht anschauen. Es bleibt.`
        : checked.ok
          ? `Raumbild «${job.name}» passt zur Beschreibung.`
          : roomPlateNeedsRedraw(next)
            ? `Raumbild «${job.name}» passt nicht (${checked.noteDe.replace(/[.\s]+$/, '')}). Es wird noch einmal gezeichnet.`
            : `Raumbild «${job.name}» passt nicht ganz (${checked.noteDe.replace(/[.\s]+$/, '')}). Es bleibt; im Regiebuch kannst du es ändern.`,
    }
  }
  const old = roomPlateFor(opts.continuity.plates, job.name)
  const legacy = old ? undefined : placePlate(opts.library, job.name)
  if (legacy?.imageUrl && legacy.description?.trim() === lookEn.trim()) {
    return {
      library: opts.library,
      continuity: {
        ...opts.continuity,
        plates: withRoomPlate(opts.continuity.plates, {
          place: job.name,
          url: legacy.imageUrl,
          assetId: legacy.id,
          tries: 1,
          at: new Date().toISOString(),
        }),
      },
      didDe: `Raumbild «${job.name}» aus der Bibliothek übernommen.`,
    }
  }
  const painted = await paintRoomPlate({
    userId: opts.userId,
    name: job.name,
    lookEn,
    styleId,
    fixEn: old?.fixEn,
  })
  return {
    library: [painted.asset, ...opts.library],
    continuity: {
      ...opts.continuity,
      plates: withRoomPlate(opts.continuity.plates, {
        place: job.name,
        url: painted.asset.imageUrl as string,
        assetId: painted.asset.id,
        tries: (old?.tries ?? 0) + 1,
        at: new Date().toISOString(),
      }),
    },
    didDe: `Raumbild «${job.name}» gezeichnet (leer, feste Einrichtung).`,
  }
}

/** Zeichnet das leere Raumbild eines Ortes und legt es in die Bibliothek. Mit Hinweis: das alte Bild ändern. */
export async function paintRoomPlate(opts: {
  userId: string
  name: string
  lookEn: string
  styleId?: StoryArtStyleId
  fixEn?: string
  change?: { fromUrl: string; hintDe: string }
}): Promise<{ asset: StoryLibraryAsset }> {
  const description = opts.fixEn
    ? `${opts.lookEn}\nThe last try was wrong: ${opts.fixEn}`
    : opts.lookEn
  const drawn = await generateStoryEnvironment(
    description,
    opts.name,
    opts.styleId,
    opts.change ? { imageUrl: opts.change.fromUrl, change: opts.change.hintDe } : undefined,
  )
  const asset = await saveStoryAsset(opts.userId, {
    type: 'environment',
    name: opts.name,
    description: opts.lookEn,
    imageUrl: drawn.imageUrl,
    tags: roomPlateTags(opts.styleId, opts.lookEn),
    styleId: opts.styleId,
    prompt: drawn.prompt,
  })
  return { asset }
}

const ROOM_PLATE_JUDGE = `Du bist die Regie einer Bildergeschichte. Bild 1 ist das Raumbild eines Ortes: leer, die feste Einrichtung für alle späteren Bilder an diesem Ort.
Zuerst beschreibst du nüchtern, was zu sehen ist: Wände, Fenster, Türen, jedes Möbelstück mit Anzahl und Platz im Bild (links, rechts, hinten, Mitte).
Dann prüfst du gegen die Beschreibung des Ortes:
- empty: keine Person, kein Gesicht, keine Silhouette, kein Körperteil.
- furniture: jedes Möbelstück aus der Beschreibung ist da, in der beschriebenen Anzahl; kein zusätzliches grosses Möbelstück, das nicht beschrieben ist.
- layout: Möbel, Fenster und Türen stehen an der Wand oder Seite, die die Beschreibung nennt; man sieht den Raum weit genug, um die Einrichtung zu erkennen.
Kleine Dinge (Deko, Pflanzen, Licht) sind frei.
Nur JSON: { "seenDe": "", "empty": true, "furniture": true, "layout": true, "ok": true, "noteDe": "", "fixEn": "" }
ok ist nur true, wenn empty, furniture und layout true sind. noteDe: ein kurzer deutscher Satz für Jean-Marie, ohne Fachwörter, was falsch ist (leer, wenn alles passt). fixEn: was beim Neuzeichnen anders sein muss, englisch, konkret.`

/** Die Regie schaut das Raumbild einmal an: leer und Einrichtung wie beschrieben. null = konnte nicht anschauen. */
export async function judgeRoomPlate(opts: {
  url: string
  name: string
  lookEn: string
  timeoutMs?: number
}): Promise<{ ok: boolean; noteDe: string; fixEn: string; model: string } | null> {
  const image = await imagePartFromUrl(opts.url, { timeoutMs: 15_000 })
  if (!image) return null
  try {
    const { value, model } = await regieJsonWithModel<unknown>(
      ROOM_PLATE_JUDGE,
      `ORT: ${opts.name}\nBESCHREIBUNG (englisch): ${opts.lookEn}`,
      [image],
      {
        temperature: 0.1,
        timeoutMs: opts.timeoutMs ?? 100_000,
        timeoutMessage: 'Die Regie hat das Raumbild nicht rechtzeitig angeschaut',
      },
    )
    const read = readRoomPlateAnswer(value)
    return read ? { ...read, model } : null
  } catch {
    return null
  }
}

/** Raumbild eines Ortes: im Katalog gewählt, sonst das für diese Geschichte gezeichnete. */
export function roomPlateUrl(
  continuity: FilmContinuity | undefined,
  library: StoryLibraryAsset[],
  picks: CatalogCast | null | undefined,
  name: string,
): string | undefined {
  if (!name.trim()) return undefined
  return pickedCastUrl(library, picks?.placeIds, name) || roomPlateFor(continuity?.plates, name)?.url
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
