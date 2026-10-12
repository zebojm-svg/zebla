/**
 * Film-Projekt: Dialog → billiges Storyboard, Bibliothek zuerst.
 * Posen und Hintergründe werden wiederverwendet (spiegeln/zoomen),
 * teure KI nur wenn etwas fehlt.
 */

import { characterBaseName } from './character-parts.js'
import { canonicalIdentityAssets, isCutoutFromStill } from './library-identities.js'
import { lineShouldSpeak, lineSpeechText } from './line-speech.js'
import {
  inferDialogLineKind,
  isStageSpeaker,
  type Dialog,
  type DialogLine,
  type DialogLineKind,
  type DialogSection,
} from './types.js'
import { spokenSpeakerName } from './speakers.js'
import { foleyEventsFromText, inferSoundCueDe, type FoleyKind } from './film-scene-foley.js'
import { inferFilmPlaceKey, inferSettingHintDe } from './film-place.js'
import type { StoryLibraryAsset } from './story-types.js'
import {
  STILL_POSES,
  getStillPose,
  type StillPoseId,
} from './story-stills.js'

export type FilmMatchKind = 'reuse' | 'transform' | 'missing'
export type FilmDepth = 'foreground' | 'mid' | 'background'
export type FilmBoardSource = 'rules' | 'gemini'
/** Weit = ganzer Raum. Nahaufnahme = wer spricht. Zwischenbild = Tür, Tee, Detail. */
export type FilmShot = 'wide' | 'closeup' | 'insert'

export interface FilmPlacement {
  name: string
  poseId: StillPoseId
  poseHint: string
  depth: FilmDepth
  /** Mitte der Figur, 0–100 quer. */
  x: number
  /** Fußpunkt, 0–100 von oben. Fehlt = aus der Tiefe. */
  y?: number
  scale: number
  flip: boolean
  libraryAssetId?: string
  imageUrl?: string
  match: FilmMatchKind
  matchNoteDe: string
  /** Manuell gestellt (ziehen/zoomen) — Rematch überschreibt die Lage nicht. */
  layoutLocked?: boolean
  /** KI hat x/y/scale sinnvoll gelegt (sitzen im Möbel). */
  layoutByAi?: boolean
}

export interface FilmBackground {
  hint: string
  libraryAssetId?: string
  imageUrl?: string
  match: FilmMatchKind
  matchNoteDe: string
}

export interface FilmStoryboardPanel {
  id: string
  sceneId: string
  sceneIndex: number
  panelIndex: number
  sectionId: string
  lineIds: string[]
  caption: string
  imageCue: string
  soundCue: string
  speechCue: string
  settingHint: string
  expressionHint?: string
  placements: FilmPlacement[]
  background: FilmBackground
  directorNote?: string
  /** Freier Kommentar zur Zeile */
  comment?: string
  sketchUrl?: string
  sketchLibraryId?: string
  /** Fertiges Standbild dieser Zeile (kein bewegter Film). */
  stillUrl?: string
  stillStyleId?: string
  stillError?: string
  /** Was an diesem Bild korrigiert werden soll (nur dieses Bild neu). */
  stillCorrection?: string
  /** Nach dem Erzeugen: Figuren und Hintergrund in der Bibliothek. */
  harvestNoteDe?: string
  /** Weit (Raum), Nahaufnahme (Gesicht) oder Zwischenbild (Tür, Tee). */
  shot?: FilmShot
  /** Wer in der Nahaufnahme spricht. */
  closeupSpeaker?: string
}

export interface FilmScene {
  id: string
  title: string
  noteDe: string
}

export interface FilmStoryboard {
  version: 1
  source: FilmBoardSource
  scenes: FilmScene[]
  panels: FilmStoryboardPanel[]
  updatedAt: string
  summaryDe?: string
}

export interface FilmPlan {
  version: 1
  targetLanguage: string
  scenes: Array<{ sceneId: string; styleId: string; noteDe?: string }>
  timelineNotes: Array<{ id: string; at: string; note: string }>
  updatedAt: string
}

export interface FilmDraftPanel {
  sectionId: string
  lineIds: string[]
  caption?: string
  imageCue?: string
  soundCue?: string
  speechCue?: string
  settingHint?: string
  expressionHint?: string
  shot?: FilmShot
  closeupSpeaker?: string
  characters?: Array<{
    name: string
    poseHint?: string
    depth?: FilmDepth
    x?: number
  }>
}

const FLIP_PAIRS: Record<string, StillPoseId> = {
  'look-left': 'look-right',
  'look-right': 'look-left',
}

const POSE_KEYWORDS: Array<{ id: StillPoseId; words: string[] }> = [
  { id: 'sitting', words: ['sitzt', 'sitzen', 'sitzend', 'sitting', 'setzt sich', 'hocker', 'bank'] },
  { id: 'waving', words: ['winkt', 'winken', 'waving', 'winke', 'hebt die hand'] },
  { id: 'walking', words: ['geht', 'gehen', 'läuft', 'laufen', 'walking', 'schritt', 'spaziergang'] },
  { id: 'look-left', words: ['nach links', 'schaut links', 'blick nach links', 'look left', 'links'] },
  { id: 'look-right', words: ['nach rechts', 'schaut rechts', 'blick nach rechts', 'look right', 'rechts'] },
  {
    id: 'standing-three-quarter',
    words: ['schräg', 'drei viertel', 'three-quarter', 'halb seitlich'],
  },
  { id: 'standing-front', words: ['steht', 'stehen', 'stehend', 'standing', 'vorderansicht'] },
]

export function inferPoseId(text: string): StillPoseId {
  const hay = text.toLowerCase()
  for (const row of POSE_KEYWORDS) {
    if (row.words.some((w) => hay.includes(w))) return row.id
  }
  return 'standing-front'
}

export function defaultPlacementY(depth: FilmDepth): number {
  if (depth === 'background') return 70
  if (depth === 'foreground') return 90
  return 82
}

export function inferDepth(text: string): FilmDepth {
  const hay = text.toLowerCase()
  if (
    hay.includes('hintergrund') ||
    hay.includes('hinten') ||
    hay.includes('weit weg') ||
    hay.includes('im hinteren')
  ) {
    return 'background'
  }
  if (hay.includes('vordergrund') || hay.includes('vorne') || hay.includes('nah')) {
    return 'foreground'
  }
  return 'mid'
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function samePerson(a: string, b: string): boolean {
  return characterBaseName(a).toLowerCase() === characterBaseName(b).toLowerCase()
}

function assetPoseId(asset: StoryLibraryAsset): StillPoseId | null {
  const tags = (asset.tags ?? []).map((t) => t.toLowerCase())
  for (const pose of STILL_POSES) {
    if (tags.includes(pose.id) || tags.includes(pose.label.toLowerCase())) return pose.id
    if (
      asset.legPoseId === pose.legPoseId &&
      asset.headAngleId === pose.headAngleId &&
      (asset.armPoseId ?? 'relaxed') === pose.armPoseId
    ) {
      return pose.id
    }
  }
  if (asset.legPoseId?.startsWith('sitting')) return 'sitting'
  if (asset.legPoseId === 'walking') return 'walking'
  if (asset.armPoseId === 'waving') return 'waving'
  if (asset.headAngleId === 'side-left') return 'look-left'
  if (asset.headAngleId === 'side-right') return 'look-right'
  return null
}

export function matchCharacterPose(
  name: string,
  poseId: StillPoseId,
  library: StoryLibraryAsset[],
): Pick<FilmPlacement, 'libraryAssetId' | 'imageUrl' | 'match' | 'matchNoteDe' | 'flip'> {
  const wanted = getStillPose(poseId)
  const fromIdentity = canonicalIdentityAssets(library, name)
  const people =
    fromIdentity.length > 0
      ? fromIdentity
      : library.filter(
          (a) =>
            a.type === 'character' &&
            samePerson(a.name, name) &&
            !isCutoutFromStill(a),
        )
  if (people.length === 0) {
    return {
      match: 'missing',
      matchNoteDe: `${name} fehlt in der Bibliothek — einmal zeichnen, dann wiederverwenden.`,
      flip: false,
    }
  }

  const exact = people.find((a) => assetPoseId(a) === poseId)
  if (exact) {
    return {
      libraryAssetId: exact.id,
      imageUrl: exact.imageUrl,
      match: 'reuse',
      matchNoteDe: `${wanted.label} ist da — ohne KI.`,
      flip: false,
    }
  }

  const flipOf = FLIP_PAIRS[poseId]
  const flipped = flipOf ? people.find((a) => assetPoseId(a) === flipOf) : undefined
  if (flipped) {
    return {
      libraryAssetId: flipped.id,
      imageUrl: flipped.imageUrl,
      match: 'transform',
      matchNoteDe: `Vorhandene Pose spiegeln — ohne neue KI.`,
      flip: true,
    }
  }

  const any = people[0]
  return {
    libraryAssetId: any.id,
    imageUrl: any.imageUrl,
    match: 'missing',
    matchNoteDe: `${name} gibt es, aber nicht «${wanted.label}». Einmal neu zeichnen.`,
    flip: false,
  }
}

const GENERIC_PLACE_TOKENS = new Set([
  'wohnzimmer',
  'zimmer',
  'wohnung',
  'haus',
  'stube',
  'room',
  'indoor',
  'interior',
  'szene',
  'ort',
  'place',
  'home',
  'house',
])

export function matchBackground(
  hint: string,
  library: StoryLibraryAsset[],
): FilmBackground {
  const needle = hint.trim().toLowerCase()
  const envs = library.filter((a) => a.type === 'environment' || a.type === 'scene')
  if (!needle) {
    return {
      hint,
      match: 'missing',
      matchNoteDe: 'Kein Hintergrund in der Bibliothek.',
    }
  }

  const tokens = needle.split(/[^a-zäöüß0-9]+/i).filter((t) => t.length > 2)
  const specific = tokens.filter((t) => !GENERIC_PLACE_TOKENS.has(t))
  const scored = envs
    .map((env) => {
      const hay = [env.name, env.description ?? '', ...(env.tags ?? [])].join(' ').toLowerCase()
      let score = 0
      if (hay.includes(needle) && needle.length > 12) score += 6
      for (const t of specific) if (hay.includes(t)) score += 2
      for (const t of tokens) if (GENERIC_PLACE_TOKENS.has(t) && hay.includes(t)) score += 0.25
      return { env, score }
    })
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  if (best && best.score >= 2) {
    return {
      hint,
      libraryAssetId: best.env.id,
      imageUrl: best.env.imageUrl,
      match: 'reuse',
      matchNoteDe: `Hintergrund «${best.env.name}» passt — ohne KI.`,
    }
  }

  return {
    hint,
    match: 'missing',
    matchNoteDe: `Hintergrund «${hint}» fehlt — einmal zeichnen, dann wiederverwenden.`,
  }
}

function lineCueText(line: DialogLine): string {
  return [line.cueImage, line.text, line.imagePrompt].filter(Boolean).join(' ')
}

export function inferExpression(text: string): string {
  const hay = text.toLowerCase()
  if (
    hay.includes('juhe') ||
    hay.includes('freut') ||
    hay.includes('lacht') ||
    hay.includes('winkt') ||
    hay.includes('jubel')
  ) {
    return 'freut sich'
  }
  if (hay.includes('weint') || hay.includes('traurig') || hay.includes('schluchz')) return 'traurig'
  if (hay.includes('schreit') || hay.includes('wütend') || hay.includes('brüllt')) return 'schreit'
  if (hay.includes('überrascht') || hay.includes('springt') || hay.includes('erschrickt')) {
    return 'überrascht'
  }
  if (hay.includes('flüstert') || hay.includes('leise')) return 'leise / flüstert'
  return 'neutral'
}

function defaultSetting(dialog: Dialog, section: DialogSection): string {
  const fromLines = section.lines.map((l) => `${l.cueImage || ''} ${l.text}`).join(' ')
  const image = dialog.imageDirection?.trim() || ''
  if (image && image.length < 120 && !/\n/.test(image)) {
    const key = inferFilmPlaceKey(image)
    if (key === 'kitchen' || key === 'living' || key === 'door') {
      return inferSettingHintDe(image, image)
    }
    return image
  }
  return inferSettingHintDe(`${section.title} ${fromLines}`, section.title.trim() || image)
}

function speakerFromLineText(text: string): string {
  const match = text.trim().match(/^([A-ZÄÖÜ][\wÄÖÜäöüß.-]{1,40})\s*[:—–-]\s+\S/)
  return match?.[1]?.trim() ?? ''
}

function speakersInSection(
  section: DialogSection,
  existing: FilmDraftPanel[] = [],
): string[] {
  const fromLines = [
    ...new Set(
      section.lines
        .filter((l) => inferDialogLineKind(l) === 'speech')
        .map((l) => l.speaker.trim())
        .filter((name) => name && !isStageSpeaker(name)),
    ),
  ]
  if (fromLines.length > 0) return fromLines
  const fromText = [
    ...new Set(section.lines.map((l) => speakerFromLineText(l.text)).filter(Boolean)),
  ]
  if (fromText.length > 0) return fromText
  const fromDrafts = [
    ...new Set(
      existing.flatMap((d) => [
        d.closeupSpeaker?.trim() || '',
        ...(d.characters ?? []).map((c) => c.name.trim()),
      ]).filter(Boolean),
    ),
  ]
  return fromDrafts
}

function titlesOverlap(a: string, b: string): boolean {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}

/**
 * Welcher Dialog-Abschnitt zu einem Szenen-Schlüssel gehört.
 * Kein Fallback auf Szene 1 — sonst spricht Szene 2 denselben Text.
 */
export function matchDialogSection(
  dialog: Pick<Dialog, 'sections'>,
  raw?: string,
  sceneIndex?: number,
): DialogSection | undefined {
  const id = (raw ?? '').trim()
  if (!id) return undefined
  const exact = dialog.sections.find((s) => s.id === id)
  if (exact) return exact
  const lower = id.toLowerCase()
  const byTitle = dialog.sections.find((s) => s.title.trim().toLowerCase() === lower)
  if (byTitle) return byTitle
  if (id.length >= 4) {
    const byContains = dialog.sections.find((s) => titlesOverlap(id, s.title))
    if (byContains) {
      const idx = dialog.sections.indexOf(byContains)
      if (typeof sceneIndex === 'number' && sceneIndex > 0 && idx === 0 && sceneIndex !== idx) {
        /* späteren Szenen nicht Szene 1 über den Titel unterschieben */
      } else {
        return byContains
      }
    }
  }
  const n = Number(id)
  if (Number.isInteger(n) && n >= 1 && n <= dialog.sections.length) {
    if (typeof sceneIndex === 'number' && sceneIndex !== n - 1) return undefined
    return dialog.sections[n - 1]
  }
  return undefined
}

/** Gemini schreibt oft «1» oder den Szenentitel statt der echten Abschnitts-Id. */
export function resolveDraftSectionId(dialog: Pick<Dialog, 'sections'>, raw?: string): string {
  const matched = matchDialogSection(dialog, raw)
  if (matched) return matched.id
  const id = (raw ?? '').trim()
  if (id) return id
  return dialog.sections[0]?.id || 'scene-1'
}

export function parseFilmShot(raw?: string): FilmShot | undefined {
  const t = (raw || '').trim().toLowerCase()
  if (t === 'closeup' || t === 'close-up' || t === 'nahaufnahme') return 'closeup'
  if (t === 'insert' || t === 'zwischenbild' || t === 'cutaway') return 'insert'
  if (t === 'wide' || t === 'weit' || t === 'grundbild') return 'wide'
  return undefined
}

function shotFromCueText(cue?: string): FilmShot | undefined {
  const t = (cue || '').trim().toLowerCase()
  if (!t) return undefined
  if (/nahaufnahme|close-?up/.test(t)) return 'closeup'
  if (/zwischenbild|insert|cutaway/.test(t)) return 'insert'
  if (/ganzer raum|weit-?bild|grundbild/.test(t)) return 'wide'
  return undefined
}

const INSERT_HINT =
  /klopft|klingelt|tür|tuer|\bdoor\b|teekanne|bereitet tee|an der tür|die tür|prospekt|zwischenbild|\binsert\b|öffnet die|kommt herein/

export function isPlaceholderImageCue(cue?: string): boolean {
  const t = (cue || '').trim().toLowerCase()
  if (!t) return true
  return /wie zuvor|wie das vorige|gleiches bild|wie vorher/.test(t)
}

export function insertCueFromText(text: string, cueImage?: string): string {
  const fromCue = (cueImage || '').trim()
  if (fromCue && !isPlaceholderImageCue(fromCue)) return fromCue
  const t = text.toLowerCase()
  if (/klopf|klingel/.test(t)) {
    return 'Wohnungstür von innen, Schloss und Klinke auf Türhöhe (1–1,2 m), Kamera auf Augenhöhe eines stehenden Erwachsenen — nicht den Boden, nicht nur Füsse.'
  }
  if (/tee/.test(t)) {
    return 'Kessel an der Spüle in Arbeitshöhe, Kamera auf Augenhöhe eines Stehenden — nicht die Füsse, nicht der ganze Raum.'
  }
  if (/tür|tuer|door/.test(t)) {
    return 'Die Tür von innen, Schloss auf normaler Türhöhe, Kamera auf Augenhöhe — nicht den Boden.'
  }
  if (/prospekt/.test(t)) return 'Der Prospekt in der Hand, lesbar.'
  return `Zwischenbild: ${text.trim().slice(0, 80) || 'ein Detail der Szene'}`
}

export function inferShotForLine(opts: {
  kind: DialogLineKind
  speaker: string
  text: string
  cueImage?: string
  hadWide: boolean
}): { shot: FilmShot; closeupSpeaker?: string } {
  const fromCue = shotFromCueText(opts.cueImage)
  if (fromCue === 'closeup') {
    return { shot: 'closeup', closeupSpeaker: opts.speaker }
  }
  if (fromCue === 'insert') return { shot: 'insert' }
  const blob = `${opts.cueImage || ''} ${opts.text}`.toLowerCase()
  const insertish = INSERT_HINT.test(blob)
  if (opts.kind === 'action' || (opts.kind !== 'speech' && insertish)) {
    return { shot: 'insert' }
  }
  if (opts.kind === 'speech' && insertish && /tür|tuer|klopft|klingelt|tee|prospekt/.test(blob)) {
    return { shot: 'insert' }
  }
  if (opts.kind === 'narrator') {
    if (insertish) return { shot: 'insert' }
    if (!opts.hadWide) return { shot: 'wide' }
    return { shot: 'insert' }
  }
  if (!opts.hadWide) return { shot: 'wide' }
  return { shot: 'closeup', closeupSpeaker: opts.speaker }
}

function defaultImageCue(opts: {
  shot: FilmShot
  speaker: string
  setting: string
  speakers: string[]
  text: string
  cueImage?: string
}): string {
  if (opts.cueImage?.trim() && !isPlaceholderImageCue(opts.cueImage)) return opts.cueImage.trim()
  if (opts.shot === 'insert') return insertCueFromText(opts.text, opts.cueImage)
  if (opts.shot === 'closeup') {
    return `Nahaufnahme ${opts.speaker}. ${opts.speaker} spricht — Kamera auf das Gesicht, nicht den ganzen Raum.`
  }
  return `Ganzer Raum: ${opts.setting}. Alle: ${opts.speakers.join(', ') || 'die Figuren'}.`
}

function namesMentioned(text: string, speakers: string[]): string[] {
  const hay = text.toLowerCase()
  return speakers.filter((name) => name.trim() && hay.includes(name.trim().toLowerCase()))
}

function stageLabel(kind: DialogLineKind): string {
  if (kind === 'action') return 'Handlung'
  if (kind === 'narrator') return 'Erzähler'
  return ''
}

/** Bild-Notiz verlangt ein neues Standbild (sonst die vorige Zeile wiederverwenden). */
export function cueAsksNewPicture(cue?: string): boolean {
  const t = (cue || '').trim().toLowerCase()
  if (!t) return false
  if (isPlaceholderImageCue(t)) return false
  return /nahaufnahme|close-?up|zwischenbild|insert|steht auf|aufstehen|geht |laufen|läuft |klingelt|klopft|zoom|tür|tuer|tee|prospekt|winkt|setzt sich|bereitet/.test(
    t,
  )
}

function panelSpeakerName(
  panel: Pick<FilmStoryboardPanel, 'closeupSpeaker' | 'placements' | 'caption'>,
): string {
  const close = panel.closeupSpeaker?.trim()
  if (close) return close.toLowerCase()
  const placed = panel.placements?.[0]?.name?.trim()
  if (placed) return placed.toLowerCase()
  const cap = panel.caption?.match(/^([^:]{1,40}):/)
  return cap?.[1]?.trim().toLowerCase() || ''
}

export function panelWantsOwnStill(
  panel: Pick<
    FilmStoryboardPanel,
    'id' | 'stillCorrection' | 'imageCue' | 'panelIndex' | 'shot' | 'closeupSpeaker' | 'placements' | 'caption' | 'settingHint'
  >,
  scenePanels: Pick<
    FilmStoryboardPanel,
    'id' | 'panelIndex' | 'shot' | 'closeupSpeaker' | 'imageCue' | 'placements' | 'caption' | 'settingHint'
  >[],
): boolean {
  const ordered = [...scenePanels].sort((a, b) => a.panelIndex - b.panelIndex)
  const idx = ordered.findIndex((p) => p.id === panel.id)
  if (idx <= 0) return true
  if (panel.stillCorrection?.trim()) return true
  const shot = panel.shot ?? 'wide'
  if (shot === 'closeup' || shot === 'insert') return true
  const prev = ordered[idx - 1]
  if (!prev) return true
  if ((prev.shot ?? 'wide') !== shot) return true
  const who = panelSpeakerName(panel)
  const prevWho = panelSpeakerName(prev)
  if (who && prevWho && who !== prevWho) return true
  if (inferFilmPlaceKey(`${panel.settingHint || ''} ${panel.imageCue || ''}`) !==
      inferFilmPlaceKey(`${prev.settingHint || ''} ${prev.imageCue || ''}`)) {
    return true
  }
  if ((prev.closeupSpeaker || '') !== (panel.closeupSpeaker || '')) return true
  return cueAsksNewPicture(panel.imageCue)
}

/**
 * Pro Dialogzeile ein Bild. Die Kamera folgt der Regie:
 * erstes Sprechen = Grundbild, später wer spricht = Nahaufnahme,
 * Handlung (Tür, Tee) = Zwischenbild — nicht immer der ganze Raum.
 */
export function ensureCoverageDrafts(
  dialog: Dialog,
  drafts: FilmDraftPanel[] = [],
): FilmDraftPanel[] {
  const bySection = new Map<string, FilmDraftPanel[]>()
  for (const draft of drafts) {
    const id = resolveDraftSectionId(dialog, draft.sectionId)
    const list = bySection.get(id) ?? []
    list.push({ ...draft, sectionId: id })
    bySection.set(id, list)
  }
  const out: FilmDraftPanel[] = []
  for (const section of dialog.sections) {
    const existing = bySection.get(section.id) ?? []
    const speakers = speakersInSection(section, existing)
    const sectionSetting = existing[0]?.settingHint?.trim() || defaultSetting(dialog, section)
    const blob = section.lines.map((l) => lineCueText(l)).join(' ')
    const poseHint = inferPoseId(blob)
    let hadWide = false
    section.lines.forEach((line) => {
      const prior = existing.find((d) => d.lineIds?.includes(line.id))
      const kind = inferDialogLineKind(line)
      const speaker =
        line.speaker.trim() ||
        (kind === 'action' ? 'Handlung' : kind === 'narrator' ? 'Erzähler' : speakers[0] || 'Figur')
      const lineCue = line.cueImage?.trim() || ''
      const priorCue =
        prior?.imageCue?.trim() && !isPlaceholderImageCue(prior.imageCue) ? prior.imageCue.trim() : ''
      const inferred = inferShotForLine({
        kind,
        speaker,
        text: line.text,
        cueImage: lineCue || priorCue,
        hadWide,
      })
      const geminiShot = parseFilmShot(prior?.shot)
      const shot: FilmShot =
        !hadWide && kind === 'speech'
          ? geminiShot === 'insert'
            ? 'insert'
            : 'wide'
          : geminiShot === 'insert' || geminiShot === 'closeup'
            ? geminiShot
            : inferred.shot
      const setting = inferSettingHintDe(
        `${line.text} ${lineCue} ${priorCue} ${section.title}`,
        prior?.settingHint || sectionSetting,
      )
      const imageCue = defaultImageCue({
        shot,
        speaker,
        setting,
        speakers,
        text: line.text,
        cueImage: lineCue || priorCue,
      })
      const closeupSpeaker =
        shot === 'closeup' ? prior?.closeupSpeaker?.trim() || inferred.closeupSpeaker || speaker : undefined
      const caption =
        prior?.caption?.trim() ||
        (kind === 'action' || kind === 'narrator'
          ? `${stageLabel(kind)}: ${line.text}`.slice(0, 140)
          : `${speaker}: ${line.text}`.slice(0, 140))
      const insertPeople = namesMentioned(`${line.text} ${lineCue} ${imageCue}`, speakers)
      const place = inferFilmPlaceKey(setting)
      const widePeople =
        place === 'kitchen' || place === 'door'
          ? namesMentioned(`${line.text} ${lineCue} ${imageCue}`, speakers)
          : speakers
      out.push({
        sectionId: section.id,
        shot,
        closeupSpeaker,
        lineIds: [line.id],
        caption,
        imageCue,
        soundCue:
          line.cueSound?.trim() ||
          (kind === 'action' || kind === 'narrator'
            ? inferSoundCueDe(line.text, line.cueSound)
            : '') ||
          '',
        speechCue: prior?.speechCue || line.cueSpeech || '',
        settingHint: setting,
        expressionHint: prior?.expressionHint || inferExpression(line.text),
        characters:
          shot === 'wide'
            ? (widePeople.length ? widePeople : speakers).map((name) => ({
                name,
                poseHint,
                depth: 'mid' as FilmDepth,
              }))
            : shot === 'insert'
              ? insertPeople.map((name) => ({
                  name,
                  poseHint,
                  depth: 'mid' as FilmDepth,
                }))
              : [{ name: closeupSpeaker || speaker, poseHint, depth: 'foreground' as FilmDepth }],
      })
      if (shot === 'wide') hadWide = true
    })
  }
  return out
}

export function draftPanelsFromDialog(dialog: Dialog): FilmDraftPanel[] {
  return ensureCoverageDrafts(dialog, [])
}

/** Eine Bildzeile je Dialogzeile. */
export function expectedSceneShotCount(dialog: Dialog, sectionId: string): number {
  const section = dialog.sections.find((s) => s.id === sectionId)
  if (!section) return 1
  return Math.max(1, section.lines.length)
}

export function sceneShotPlanDe(panels: FilmStoryboardPanel[]): string {
  const n = panels.length
  return `Geplant: ${n} Bild${n === 1 ? '' : 'er'} — eines je Dialogzeile. Kamera: Weit, Nahaufnahme oder Zwischenbild.`
}

export function dialogNeedsNativeTranslation(dialog: Pick<Dialog, 'sections'>): boolean {
  return dialog.sections.some((s) =>
    s.lines.some((l) => l.text.trim() && !lineNativeDe(l)),
  )
}

export function closeupExprKey(hint?: string): string {
  const t = (hint || 'neutral').trim().toLowerCase()
  if (!t || t === 'neutral' || t === 'natürlich' || t === 'natuerlich') return 'neutral'
  return t
}

/** Schon gemalte Nahaufnahme derselben Person — dasselbe Gesicht, Mimik darf sich ändern. */
export function findReusableCloseup(
  board: FilmStoryboard,
  speaker: string,
  _expressionHint?: string,
  exceptPanelId?: string,
): string | undefined {
  return findReusableCloseupPanel(board, speaker, exceptPanelId)?.stillUrl
}

export function findReusableCloseupPanel(
  board: FilmStoryboard,
  speaker: string,
  exceptPanelId?: string,
): FilmStoryboardPanel | undefined {
  const key = characterBaseName(speaker).toLowerCase()
  for (const panel of board.panels) {
    if (exceptPanelId && panel.id === exceptPanelId) continue
    if ((panel.shot ?? 'wide') !== 'closeup') continue
    const who = characterBaseName(panel.closeupSpeaker || panel.placements[0]?.name || '')
    if (who.toLowerCase() !== key) continue
    if (!panel.stillUrl?.trim()) continue
    return panel
  }
  return undefined
}

export function buildBoardFromDrafts(
  dialog: Dialog,
  drafts: FilmDraftPanel[],
  library: StoryLibraryAsset[],
  source: FilmBoardSource,
  previous?: FilmStoryboard,
  opts?: { freshPlaces?: boolean },
): FilmStoryboard {
  const sectionIndex = new Map(dialog.sections.map((s, i) => [s.id, i]))
  const prevById = new Map((previous?.panels ?? []).map((p) => [p.id, p]))
  const panels: FilmStoryboardPanel[] = drafts.map((draft, i) => {
    const sceneIndex = sectionIndex.get(draft.sectionId) ?? 0
    const sceneId = draft.sectionId || `scene-${sceneIndex + 1}`
    const settingHint = draft.settingHint?.trim() || defaultSetting(
      dialog,
      dialog.sections[sceneIndex] ?? dialog.sections[0],
    )
    const blob = [draft.imageCue, draft.caption, draft.settingHint].filter(Boolean).join(' ')
    const placements = (draft.characters?.length
      ? draft.characters
      : draft.shot === 'insert'
        ? []
        : [{ name: 'Figur', poseHint: 'standing-front' }]
    ).map((ch, ci, all) => {
      const poseId = inferPoseId(`${ch.poseHint ?? ''} ${blob}`)
      const pose = getStillPose(poseId)
      const matched = matchCharacterPose(ch.name, poseId, library)
      const x =
        typeof ch.x === 'number'
          ? clamp(ch.x, 8, 92)
          : clamp(28 + (ci / Math.max(1, all.length - 1)) * 44, 8, 92)
      return {
        name: ch.name.trim() || 'Figur',
        poseId,
        poseHint: pose.label,
        depth: ch.depth ?? inferDepth(blob),
        x,
        y: defaultPlacementY(ch.depth ?? inferDepth(blob)),
        scale: ch.depth === 'background' ? 0.55 : ch.depth === 'foreground' ? 1 : 0.78,
        flip: matched.flip,
        libraryAssetId: matched.libraryAssetId,
        imageUrl: matched.imageUrl,
        match: matched.match,
        matchNoteDe: matched.matchNoteDe,
      } satisfies FilmPlacement
    })

    const lineKey = (draft.lineIds[0] || `n${i + 1}`).slice(0, 16)
    const keepId = `p-${lineKey}-${sceneId.slice(0, 8)}`
    const prev =
      prevById.get(keepId) ||
      (previous?.panels ?? []).find(
        (p) => draft.lineIds[0] && p.lineIds.includes(draft.lineIds[0]),
      )
    return {
      id: keepId,
      sceneId,
      sceneIndex,
      panelIndex: i + 1,
      sectionId: draft.sectionId,
      lineIds: draft.lineIds,
      caption: draft.caption?.trim() || `Bild ${i + 1}`,
      imageCue: draft.imageCue?.trim() || '',
      soundCue: draft.soundCue?.trim() || '',
      speechCue: draft.speechCue?.trim() || '',
      settingHint,
      expressionHint: draft.expressionHint?.trim() || inferExpression(blob),
      shot: parseFilmShot(draft.shot) ?? 'wide',
      closeupSpeaker: draft.closeupSpeaker,
      placements,
      background: opts?.freshPlaces
        ? {
            hint: settingHint,
            match: 'missing' as const,
            matchNoteDe: 'Neu aus dem Dialog — nicht das vorige Zimmer.',
          }
        : matchBackground(settingHint, library),
      comment: prev?.comment,
      directorNote: prev?.directorNote,
      sketchUrl: prev?.sketchUrl,
      sketchLibraryId: prev?.sketchLibraryId,
      stillUrl: prev?.stillUrl,
      stillStyleId: prev?.stillStyleId,
      stillError: prev?.stillError,
      stillCorrection: prev?.stillCorrection,
      harvestNoteDe: prev?.harvestNoteDe,
    }
  })

  const scenes = scenesFromPanels(panels, dialog, previous)
  const missing = boardNeedsDrawing({ version: 1, source, scenes, panels, updatedAt: '' })

  return {
    version: 1,
    source,
    scenes,
    panels,
    updatedAt: new Date().toISOString(),
    summaryDe:
      missing === 0
        ? `${panels.length} Bilder in ${scenes.length} Szene(n) — Bibliothek zuerst.`
        : `${panels.length} Bilder, ${missing} brauchen noch eine Zeichnung.`,
  }
}

export function planBoardWithoutAi(
  dialog: Dialog,
  library: StoryLibraryAsset[],
): FilmStoryboard {
  return buildBoardFromDrafts(dialog, draftPanelsFromDialog(dialog), library, 'rules')
}

export function applyDirectorNote(
  board: FilmStoryboard,
  panelId: string,
  note: string,
): FilmStoryboard {
  const text = note.trim()
  if (!text) return board
  const hay = text.toLowerCase()
  const panels = board.panels.map((panel) => {
    if (panel.id !== panelId) return panel
    const nameHit = panel.placements.find((pl) => hay.includes(pl.name.toLowerCase()))
    const target = nameHit ?? panel.placements[0]
    if (!target) {
      return { ...panel, directorNote: text }
    }

    let next = { ...target }
    if (hay.includes('hintergrund') || hay.includes('hinten') || hay.includes('weiter weg')) {
      next = { ...next, depth: 'background', scale: 0.5 }
    }
    if (hay.includes('vordergrund') || hay.includes('vorne') || hay.includes('näher')) {
      next = { ...next, depth: 'foreground', scale: 1 }
    }
    if (hay.includes('links')) next = { ...next, x: 22 }
    if (hay.includes('rechts')) next = { ...next, x: 78 }
    if (hay.includes('mitte')) next = { ...next, x: 50 }
    if (hay.includes('größer')) next = { ...next, scale: clamp(next.scale * 1.25, 0.3, 1.4) }
    if (hay.includes('kleiner')) next = { ...next, scale: clamp(next.scale * 0.75, 0.3, 1.4) }
    if (hay.includes('spiegel')) next = { ...next, flip: !next.flip, match: next.match === 'missing' ? 'missing' : 'transform' }

    return {
      ...panel,
      directorNote: text,
      placements: panel.placements.map((pl) => (pl === target || pl.name === target.name ? next : pl)),
    }
  })

  return { ...board, panels, updatedAt: new Date().toISOString() }
}

export function scenesFromPanels(
  panels: FilmStoryboardPanel[],
  dialog?: Dialog,
  previous?: FilmStoryboard,
): FilmScene[] {
  const prev = new Map((previous?.scenes ?? []).map((s) => [s.id, s]))
  const seen: string[] = []
  for (const p of panels) {
    const id = p.sceneId || `scene-${p.sceneIndex + 1}`
    if (!seen.includes(id)) seen.push(id)
  }
  if (seen.length === 0) {
    return [{ id: 'scene-1', title: 'Szene 1', noteDe: '' }]
  }
  return seen.map((id, i) => {
    const old = prev.get(id)
    const section = dialog?.sections.find((s) => s.id === id)
    return {
      id,
      title: old?.title || section?.title || `Szene ${i + 1}`,
      noteDe: old?.noteDe ?? '',
    }
  })
}

export function normalizeFilmStoryboard(board: FilmStoryboard): FilmStoryboard {
  const panels: FilmStoryboardPanel[] = board.panels.map((p, i) => ({
    ...p,
    sceneId: p.sceneId || `scene-${(p.sceneIndex ?? 0) + 1}`,
    panelIndex: p.panelIndex || i + 1,
    shot: parseFilmShot(p.shot) ?? 'wide',
    closeupSpeaker: p.closeupSpeaker,
    placements: (p.placements ?? []).map((pl) => ({
      ...pl,
      y: typeof pl.y === 'number' ? clamp(pl.y, 8, 96) : defaultPlacementY(pl.depth),
    })),
  }))
  return {
    ...board,
    scenes: board.scenes?.length ? board.scenes : scenesFromPanels(panels),
    panels,
  }
}

export function panelsInScene(board: FilmStoryboard, sceneId: string): FilmStoryboardPanel[] {
  return normalizeFilmStoryboard(board).panels.filter((p) => p.sceneId === sceneId)
}

export function applyPanelComment(
  board: FilmStoryboard,
  panelId: string,
  comment: string,
): FilmStoryboard {
  const next = normalizeFilmStoryboard(board)
  return {
    ...next,
    panels: next.panels.map((p) => (p.id === panelId ? { ...p, comment: comment.trim() } : p)),
    updatedAt: new Date().toISOString(),
  }
}

export function applyPanelCues(
  board: FilmStoryboard,
  panelId: string,
  cues: { soundCue?: string; imageCue?: string; speechCue?: string },
): FilmStoryboard {
  const next = normalizeFilmStoryboard(board)
  return {
    ...next,
    panels: next.panels.map((p) => {
      if (p.id !== panelId) return p
      return {
        ...p,
        soundCue: cues.soundCue !== undefined ? cues.soundCue.trim() : p.soundCue,
        imageCue: cues.imageCue !== undefined ? cues.imageCue.trim() : p.imageCue,
        speechCue: cues.speechCue !== undefined ? cues.speechCue.trim() : p.speechCue,
      }
    }),
    updatedAt: new Date().toISOString(),
  }
}

export function applySceneNote(board: FilmStoryboard, sceneId: string, noteDe: string): FilmStoryboard {
  const next = normalizeFilmStoryboard(board)
  return {
    ...next,
    scenes: next.scenes.map((s) => (s.id === sceneId ? { ...s, noteDe: noteDe.trim() } : s)),
    updatedAt: new Date().toISOString(),
  }
}

export function insertSceneAfter(
  board: FilmStoryboard,
  afterSceneId: string | null,
  title: string,
): FilmStoryboard {
  const next = normalizeFilmStoryboard(board)
  const id = `scene-${Date.now().toString(36)}`
  const scene: FilmScene = { id, title: title.trim() || `Szene ${next.scenes.length + 1}`, noteDe: '' }
  const idx = afterSceneId ? next.scenes.findIndex((s) => s.id === afterSceneId) : next.scenes.length - 1
  const scenes = [...next.scenes]
  scenes.splice(idx + 1, 0, scene)
  const placeholder: FilmStoryboardPanel = {
    id: `p-new-${id.slice(-6)}`,
    sceneId: id,
    sceneIndex: idx + 1,
    panelIndex: next.panels.length + 1,
    sectionId: id,
    lineIds: [],
    caption: 'Neue Zeile — Text ergänzen',
    imageCue: '',
    soundCue: '',
    speechCue: '',
    settingHint: '',
    expressionHint: 'neutral',
    placements: [],
    background: { hint: '', match: 'missing', matchNoteDe: 'Noch kein Hintergrund.' },
  }
  return {
    ...next,
    scenes,
    panels: [...next.panels, placeholder],
    updatedAt: new Date().toISOString(),
  }
}

export function removeScene(board: FilmStoryboard, sceneId: string): FilmStoryboard {
  const next = normalizeFilmStoryboard(board)
  if (next.scenes.length <= 1) return next
  const scenes = next.scenes.filter((s) => s.id !== sceneId)
  if (scenes.length === next.scenes.length) return next
  const panels = next.panels.filter((p) => p.sceneId !== sceneId)
  return {
    ...next,
    scenes: scenes.length ? scenes : next.scenes,
    panels,
    updatedAt: new Date().toISOString(),
  }
}

/** Alle Szenen nach dieser — Geschichte hier beenden. */
export function removeScenesAfter(board: FilmStoryboard, sceneId: string): FilmStoryboard {
  const next = normalizeFilmStoryboard(board)
  const idx = next.scenes.findIndex((s) => s.id === sceneId)
  if (idx < 0 || idx >= next.scenes.length - 1) return next
  const keep = new Set(next.scenes.slice(0, idx + 1).map((s) => s.id))
  return {
    ...next,
    scenes: next.scenes.filter((s) => keep.has(s.id)),
    panels: next.panels.filter((p) => keep.has(p.sceneId)),
    updatedAt: new Date().toISOString(),
  }
}

export function insertPanelAfter(
  board: FilmStoryboard,
  afterPanelId: string,
  text: string,
  library: StoryLibraryAsset[],
): FilmStoryboard {
  const next = normalizeFilmStoryboard(board)
  const after = next.panels.find((p) => p.id === afterPanelId) ?? next.panels[next.panels.length - 1]
  if (!after) return insertSceneAfter(next, null, 'Szene 1')
  const poseId = inferPoseId(text)
  const pose = getStillPose(poseId)
  const inferred = inferShotForLine({
    kind: inferDialogLineKind({ speaker: '', text, cueImage: text }),
    speaker: after.closeupSpeaker || after.placements[0]?.name || '',
    text,
    cueImage: text,
    hadWide: next.panels.some((p) => p.sceneId === after.sceneId && p.shot === 'wide'),
  })
  const names = Array.from(
    new Set(after.placements.map((p) => p.name).concat(guessNames(text))),
  ).filter(Boolean)
  const people =
    inferred.shot === 'insert'
      ? names.filter((n) => text.toLowerCase().includes(n.toLowerCase()))
      : names.length
        ? names
        : ['Figur']
  const placements: FilmPlacement[] = people.map((name, ci, all) => {
    const matched = matchCharacterPose(name, poseId, library)
    return {
      name,
      poseId,
      poseHint: pose.label,
      depth: inferDepth(text),
      x: clamp(28 + (ci / Math.max(1, all.length - 1)) * 44, 8, 92),
      y: defaultPlacementY(inferDepth(text)),
      scale: 0.78,
      flip: matched.flip,
      libraryAssetId: matched.libraryAssetId,
      imageUrl: matched.imageUrl,
      match: matched.match,
      matchNoteDe: matched.matchNoteDe,
    }
  })
  const panel: FilmStoryboardPanel = {
    id: `p-ins-${Date.now().toString(36)}`,
    sceneId: after.sceneId,
    sceneIndex: after.sceneIndex,
    panelIndex: after.panelIndex + 1,
    sectionId: after.sectionId,
    lineIds: [],
    caption: text.trim(),
    imageCue: text.trim(),
    soundCue: '',
    speechCue: '',
    settingHint: after.settingHint,
    expressionHint: inferExpression(text),
    shot: inferred.shot,
    closeupSpeaker: inferred.closeupSpeaker,
    placements,
    background: matchBackground(after.settingHint || text, library),
  }
  const at = next.panels.findIndex((p) => p.id === after.id)
  const panels = [...next.panels]
  panels.splice(at + 1, 0, panel)
  return { ...next, panels, updatedAt: new Date().toISOString() }
}

function guessNames(text: string): string[] {
  const matches = text.match(/\b[A-ZÄÖÜ][a-zäöüß]{2,}\b/g) ?? []
  return [...new Set(matches)].slice(0, 8)
}

export interface FilmPanelDialogueLine {
  speaker: string
  text: string
  /** Muttersprache aus Birkenbihl, oft Deutsch. */
  nativeDe?: string
  lineId?: string
  audioUrl?: string
}

export function lineNativeDe(
  line: Pick<DialogLine, 'nativeText' | 'birkenbihl' | 'speaker'>,
): string {
  const fluent = line.nativeText?.trim()
  if (fluent) return fluent
  return ''
}

function allDialogLines(dialog: Pick<Dialog, 'sections'>): Map<string, DialogLine> {
  const byId = new Map<string, DialogLine>()
  for (const section of dialog.sections) {
    for (const line of section.lines) byId.set(line.id, line)
  }
  return byId
}

export function dialogLinesInOrder(dialog: Pick<Dialog, 'sections'>): DialogLine[] {
  return dialog.sections.flatMap((section) => section.lines)
}

/** Gegenüber im Gespräch — für Blickrichtung, nicht die Kamera. */
export function panelAddressee(
  panel: FilmStoryboardPanel,
  dialog?: Pick<Dialog, 'sections'> | null,
): string | undefined {
  const lines = panelDialogueLines(panel, dialog)
  const speaker = (panel.closeupSpeaker || lines[0]?.speaker || '').trim()
  if (!speaker) return undefined
  const otherInPanel = lines.find(
    (line) => line.speaker.trim() && line.speaker.trim() !== speaker,
  )?.speaker
  if (otherInPanel?.trim()) return otherInPanel.trim()
  if (!dialog) return undefined
  const all = dialogLinesInOrder(dialog)
  const id = panel.lineIds[0]
  const idx = id
    ? all.findIndex((line) => line.id === id)
    : all.findIndex((line) => line.speaker.trim() === speaker)
  if (idx < 0) return undefined
  for (let i = idx - 1; i >= 0; i--) {
    const name = all[i]?.speaker.trim()
    if (name && name !== speaker) return name
  }
  for (let i = idx + 1; i < all.length; i++) {
    const name = all[i]?.speaker.trim()
    if (name && name !== speaker) return name
  }
  return undefined
}

function toFilmDialogueLine(line: DialogLine): FilmPanelDialogueLine {
  const kind = inferDialogLineKind(line)
  const speaker =
    kind === 'narrator'
      ? spokenSpeakerName(line) || 'Erzähler'
      : line.speaker
  return {
    speaker,
    text: line.text.trim(),
    nativeDe: lineNativeDe(line),
    lineId: line.id,
    audioUrl: line.audioUrl,
  }
}

/** Welche Dialogzeile zu diesem Bild gehört — nicht die Bildnotiz. */
export function lineForFilmPanel(
  panel: FilmStoryboardPanel,
  dialog?: Pick<Dialog, 'sections'> | null,
  scenePanels?: FilmStoryboardPanel[],
  sceneTitle?: string,
): DialogLine | undefined {
  if (!dialog?.sections.length) return undefined
  const peers = scenePanels?.length ? scenePanels : [panel]
  const sceneLines = dialogLinesForPanels(peers, dialog, sceneTitle)
  const allowed = new Set(sceneLines.map((l) => l.id))
  const byId = allDialogLines(dialog)
  for (const id of panel.lineIds ?? []) {
    const line = byId.get(id)
    if (line?.text.trim() && allowed.has(line.id)) return line
  }
  if (sceneLines.length === 0) return undefined
  const idx = peers.findIndex((p) => p.id === panel.id)
  if (idx >= 0 && sceneLines[idx]) return sceneLines[idx]
  const closeSpeaker = (panel.closeupSpeaker || '').trim()
  if (closeSpeaker) {
    const bySpeaker = sceneLines.find((l) => l.speaker.trim() === closeSpeaker)
    if (bySpeaker) return bySpeaker
  }
  return undefined
}

/** Sprecher + Text unter dem Standbild, zum Vergleichen. */
export function panelDialogueLines(
  panel: FilmStoryboardPanel,
  dialog?: Pick<Dialog, 'sections'> | null,
  scenePanels?: FilmStoryboardPanel[],
  sceneTitle?: string,
): FilmPanelDialogueLine[] {
  const line = lineForFilmPanel(panel, dialog, scenePanels, sceneTitle)
  return line ? [toFilmDialogueLine(line)] : []
}

/** Zeilen für die Szenen-Vorschau (Zielsprache + gespeicherte Stimme). */
export function panelSpeakLines(
  panel: FilmStoryboardPanel,
  dialog?: Pick<Dialog, 'sections' | 'targetLanguage'> | null,
  scenePanels?: FilmStoryboardPanel[],
  sceneTitle?: string,
): Array<{ id: string; speaker: string; text: string; audioUrl?: string }> {
  const line = lineForFilmPanel(panel, dialog, scenePanels, sceneTitle)
  if (!line) return []
  if (!lineShouldSpeak(line, dialog?.targetLanguage)) return []
  const text = lineSpeechText(line).trim() || line.text.trim()
  if (!text) return []
  const kind = inferDialogLineKind(line)
  const speaker =
    kind === 'narrator'
      ? spokenSpeakerName(line) || 'Erzähler'
      : line.speaker || 'Sprecher'
  return [
    {
      id: line.id,
      speaker,
      text,
      audioUrl: line.audioUrl,
    },
  ]
}

export interface FilmScenePreviewBeat {
  panelId: string
  panelIndex: number
  stillUrl?: string
  caption: string
  lines: Array<{ id: string; speaker: string; text: string; audioUrl?: string }>
}

export function scenePreviewBeats(
  panels: FilmStoryboardPanel[],
  dialog?: Pick<Dialog, 'sections' | 'targetLanguage'> | null,
  sceneTitle?: string,
): FilmScenePreviewBeat[] {
  return panels.map((panel) => ({
    panelId: panel.id,
    panelIndex: panel.panelIndex,
    stillUrl: panel.stillUrl,
    caption: panel.caption,
    lines: panelSpeakLines(panel, dialog, panels, sceneTitle),
  }))
}

/** Eine Zeile nach der anderen — Bild wechselt zum Sprecher, Dialog wird nicht wiederholt. */
export interface FilmPlayBeat {
  panelId: string
  stillUrl?: string
  caption: string
  establishing?: boolean
  /** Stilles Zwischenbild — Bild und Pause, keine Stimme. */
  silent?: boolean
  soundCue?: string
  foley?: FoleyKind[]
  line?: FilmPanelDialogueLine
  lineIndex: number
  lineTotal: number
}

export function dialogLineFingerprint(
  lines: Array<Pick<DialogLine, 'speaker' | 'text'>>,
): string {
  return lines
    .map((l) => `${l.speaker.trim()}\t${l.text.trim()}`)
    .filter((row) => row.trim())
    .join('\n')
}

/** Kopierte Szenen (gleicher Dialog) gehören nicht in die Geschichte. */
export function dropRepeatedDialogSections<
  T extends { title?: string; lines: Array<Pick<DialogLine, 'speaker' | 'text'>> },
>(sections: T[]): T[] {
  const seen = new Set<string>()
  return sections.filter((section) => {
    const fp = dialogLineFingerprint(section.lines)
    if (!fp || seen.has(fp)) return false
    seen.add(fp)
    return true
  })
}

export function repeatedDialogSectionTitles(dialog: Pick<Dialog, 'sections'>): string[] {
  const kept = new Map<string, string>()
  const repeats: string[] = []
  for (const section of dialog.sections) {
    const fp = dialogLineFingerprint(section.lines)
    if (!fp) continue
    const first = kept.get(fp)
    if (first) repeats.push(section.title || 'Szene')
    else kept.set(fp, section.title || 'Szene')
  }
  return repeats
}

/** Board zeigt nur Dialog-Szenen — keine Extra-Szenen vom Storyboard. */
export function filmScenesFromDialog(
  dialog: Pick<Dialog, 'sections'>,
  board?: FilmStoryboard,
): FilmScene[] {
  return dialog.sections.map((section, i) => {
    const old = board?.scenes.find((s) => s.id === section.id)
    return {
      id: section.id,
      title: old?.title || section.title || `Szene ${i + 1}`,
      noteDe: old?.noteDe ?? '',
    }
  })
}

/** Altes Board nach neuem Dialog: Szenen-Ids passen nicht mehr. */
export function boardFollowsDialog(
  board: FilmStoryboard | null | undefined,
  dialog: Pick<Dialog, 'sections'>,
): boolean {
  if (!board || dialog.sections.length === 0) return false
  return dialog.sections.some((section) => panelsForDialogScene(board, dialog, section.id).length > 0)
}

export function panelsForDialogScene(
  board: FilmStoryboard,
  dialog: Pick<Dialog, 'sections'>,
  sectionId: string,
): FilmStoryboardPanel[] {
  const matched = board.panels.filter((p) => p.sceneId === sectionId || p.sectionId === sectionId)
  if (matched.length > 0) return matched
  const lineIds = new Set(
    dialog.sections.find((s) => s.id === sectionId)?.lines.map((l) => l.id) ?? [],
  )
  if (lineIds.size === 0) return []
  return board.panels.filter((p) => (p.lineIds ?? []).some((id) => lineIds.has(id)))
}

function sceneLookupKeys(
  panels: FilmStoryboardPanel[],
  sceneTitle?: string,
): string[] {
  return [
    ...new Set(
      [...panels.map((p) => p.sectionId), ...panels.map((p) => p.sceneId), sceneTitle].filter(
        (k): k is string => Boolean(k?.trim()),
      ),
    ),
  ]
}

function claimedDialogSection(
  panels: FilmStoryboardPanel[],
  dialog: Pick<Dialog, 'sections'>,
  sceneTitle?: string,
): DialogSection | undefined {
  const sceneIndex = panels[0]?.sceneIndex
  for (const key of sceneLookupKeys(panels, sceneTitle)) {
    const section = matchDialogSection(dialog, key, sceneIndex)
    if (section) return section
  }
  return undefined
}

function dialogLinesForPanels(
  panels: FilmStoryboardPanel[],
  dialog?: Pick<Dialog, 'sections'> | null,
  sceneTitle?: string,
): DialogLine[] {
  if (!dialog?.sections.length) return []
  const byId = allDialogLines(dialog)
  const seen = new Set<string>()
  const out: DialogLine[] = []
  const add = (line?: DialogLine) => {
    if (!line?.text.trim() || seen.has(line.id)) return
    seen.add(line.id)
    out.push(line)
  }

  const claimed = claimedDialogSection(panels, dialog, sceneTitle)
  const sceneIndex = panels[0]?.sceneIndex ?? 0

  for (const panel of panels) {
    for (const id of panel.lineIds ?? []) {
      const line = byId.get(id)
      if (!line) continue
      if (claimed && !claimed.lines.some((l) => l.id === line.id)) continue
      if (!claimed && sceneIndex > 0) continue
      add(line)
    }
  }
  if (out.length > 0) return out

  if (claimed) {
    for (const line of claimed.lines) add(line)
    return out
  }

  return out
}

export function sceneSpokenLines(
  panels: FilmStoryboardPanel[],
  dialog?: Pick<Dialog, 'sections'> | null,
  sceneTitle?: string,
): DialogLine[] {
  return dialogLinesForPanels(panels, dialog, sceneTitle)
}

export function sceneHasSpokenDialog(
  panels: FilmStoryboardPanel[],
  dialog?: Pick<Dialog, 'sections'> | null,
  sceneTitle?: string,
): boolean {
  return dialogLinesForPanels(panels, dialog, sceneTitle).some((l) => l.text.trim())
}

/** Spätere Szene zeigt denselben Text wie eine frühere — kein neuer Dialog. */
export function sceneRepeatsEarlierDialog(
  panels: FilmStoryboardPanel[],
  dialog?: Pick<Dialog, 'sections'> | null,
  sceneTitle?: string,
  earlierPanels: FilmStoryboardPanel[][] = [],
): boolean {
  const lines = dialogLinesForPanels(panels, dialog, sceneTitle)
  if (lines.length === 0) return false
  const fp = dialogLineFingerprint(lines)
  for (const earlier of earlierPanels) {
    const prev = dialogLinesForPanels(earlier, dialog)
    if (prev.length > 0 && dialogLineFingerprint(prev) === fp) return true
  }
  const idx = panels[0]?.sceneIndex ?? 0
  for (let i = 0; i < Math.min(idx, dialog?.sections.length ?? 0); i++) {
    const section = dialog?.sections[i]
    if (section && dialogLineFingerprint(section.lines) === fp) return true
  }
  return false
}

export function scenePlayBeats(
  panels: FilmStoryboardPanel[],
  dialog?: Pick<Dialog, 'sections' | 'targetLanguage'> | null,
  sceneTitle?: string,
): FilmPlayBeat[] {
  const wide = panels.find((p) => p.shot === 'wide' && p.stillUrl)
  const beats: FilmPlayBeat[] = []
  let spoken = 0
  for (const panel of panels) {
    const line = lineForFilmPanel(panel, dialog, panels, sceneTitle)
    const kind = line ? inferDialogLineKind(line) : undefined
    const silent = !line || !lineShouldSpeak(line, dialog?.targetLanguage)
    const caption = line
      ? kind === 'action' || kind === 'narrator'
        ? line.text.slice(0, 140)
        : `${line.speaker}: ${line.text}`.slice(0, 140)
      : panel.caption
    const soundCue =
      panel.soundCue?.trim() ||
      line?.cueSound?.trim() ||
      (kind === 'action' && line ? inferSoundCueDe(line.text, line.cueSound) : '') ||
      ''
    const foley = foleyEventsFromText(soundCue, panel.imageCue, caption, line?.text)
    beats.push({
      panelId: panel.id,
      stillUrl:
        panel.stillUrl ||
        ((panel.shot ?? 'wide') === 'closeup' ? wide?.stillUrl : undefined),
      caption,
      silent,
      soundCue: soundCue || undefined,
      foley: foley.length ? foley : undefined,
      line: silent || !line ? undefined : toFilmDialogueLine(line),
      lineIndex: silent ? -1 : spoken++,
      lineTotal: 0,
    })
  }
  for (const beat of beats) beat.lineTotal = spoken
  const firstIsCloseup = (panels[0]?.shot ?? 'wide') === 'closeup'
  const intro: FilmPlayBeat[] =
    firstIsCloseup && wide?.stillUrl
      ? [
          {
            panelId: wide.id,
            stillUrl: wide.stillUrl,
            caption: wide.caption,
            establishing: true,
            silent: true,
            lineIndex: -1,
            lineTotal: spoken,
          },
        ]
      : []
  return [...intro, ...beats]
}

export function boardNeedsDrawing(board: FilmStoryboard | undefined): number {
  if (!board) return 0
  return board.panels.filter(
    (p) =>
      p.background.match === 'missing' ||
      p.placements.some((pl) => pl.match === 'missing'),
  ).length
}

export function isFilmStoryboard(value: unknown): value is FilmStoryboard {
  if (!value || typeof value !== 'object') return false
  const v = value as FilmStoryboard
  return v.version === 1 && Array.isArray(v.panels)
}

export function isFilmPlan(value: unknown): value is FilmPlan {
  if (!value || typeof value !== 'object') return false
  const v = value as FilmPlan
  return v.version === 1 && Array.isArray(v.scenes) && Array.isArray(v.timelineNotes)
}
