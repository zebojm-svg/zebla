/**
 * Film-Projekt: Dialog → billiges Storyboard, Bibliothek zuerst.
 * Posen und Hintergründe werden wiederverwendet (spiegeln/zoomen),
 * teure KI nur wenn etwas fehlt.
 */

import { characterBaseName } from './character-parts.js'
import { lineSpeechText } from './line-speech.js'
import type { Dialog, DialogLine, DialogSection } from './types.js'
import type { StoryLibraryAsset } from './story-types.js'
import {
  STILL_POSES,
  getStillPose,
  type StillPoseId,
} from './story-stills.js'

export type FilmMatchKind = 'reuse' | 'transform' | 'missing'
export type FilmDepth = 'foreground' | 'mid' | 'background'
export type FilmBoardSource = 'rules' | 'gemini'

export interface FilmPlacement {
  name: string
  poseId: StillPoseId
  poseHint: string
  depth: FilmDepth
  x: number
  scale: number
  flip: boolean
  libraryAssetId?: string
  imageUrl?: string
  match: FilmMatchKind
  matchNoteDe: string
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
  const people = library.filter(
    (a) => a.type === 'character' && samePerson(a.name, name),
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

export function matchBackground(
  hint: string,
  library: StoryLibraryAsset[],
): FilmBackground {
  const needle = hint.trim().toLowerCase()
  const envs = library.filter((a) => a.type === 'environment' || a.type === 'scene')
  if (!needle) {
    const first = envs[0]
    if (!first) {
      return {
        hint,
        match: 'missing',
        matchNoteDe: 'Kein Hintergrund in der Bibliothek.',
      }
    }
    return {
      hint: first.name,
      libraryAssetId: first.id,
      imageUrl: first.imageUrl,
      match: 'reuse',
      matchNoteDe: `Hintergrund «${first.name}» — ohne KI.`,
    }
  }

  const tokens = needle.split(/[^a-zäöüß0-9]+/i).filter((t) => t.length > 2)
  const scored = envs
    .map((env) => {
      const hay = [env.name, env.description ?? '', ...(env.tags ?? [])].join(' ').toLowerCase()
      let score = 0
      if (hay.includes(needle)) score += 5
      for (const t of tokens) if (hay.includes(t)) score += 1
      return { env, score }
    })
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  if (best && best.score > 0) {
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
  return (
    dialog.filmPrompt?.trim() ||
    dialog.imageDirection?.trim() ||
    section.title.trim() ||
    'Ort der Szene'
  )
}

export function draftPanelsFromDialog(dialog: Dialog): FilmDraftPanel[] {
  const drafts: FilmDraftPanel[] = []
  for (const section of dialog.sections) {
    for (const line of section.lines) {
      const blob = lineCueText(line)
      drafts.push({
        sectionId: section.id,
        lineIds: [line.id],
        caption: `${line.speaker}: ${line.text}`,
        imageCue: line.cueImage?.trim() || blob,
        soundCue: line.cueSound?.trim() || dialog.soundDirection?.trim() || '',
        speechCue: line.cueSpeech?.trim() || dialog.speechDirection?.trim() || '',
        settingHint: defaultSetting(dialog, section),
        expressionHint: inferExpression(blob),
        characters: [
          {
            name: line.speaker,
            poseHint: inferPoseId(blob),
            depth: inferDepth(`${blob} ${line.cueImage ?? ''}`),
            x: 42,
          },
        ],
      })
    }
  }
  return drafts
}

export function buildBoardFromDrafts(
  dialog: Dialog,
  drafts: FilmDraftPanel[],
  library: StoryLibraryAsset[],
  source: FilmBoardSource,
  previous?: FilmStoryboard,
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
        scale: ch.depth === 'background' ? 0.55 : ch.depth === 'foreground' ? 1 : 0.78,
        flip: matched.flip,
        libraryAssetId: matched.libraryAssetId,
        imageUrl: matched.imageUrl,
        match: matched.match,
        matchNoteDe: matched.matchNoteDe,
      } satisfies FilmPlacement
    })

    const keepId = `p-${i + 1}-${sceneId.slice(0, 8)}`
    const prev = prevById.get(keepId)
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
      placements,
      background: matchBackground(settingHint, library),
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
  const panels = board.panels.map((p, i) => ({
    ...p,
    sceneId: p.sceneId || `scene-${(p.sceneIndex ?? 0) + 1}`,
    panelIndex: p.panelIndex || i + 1,
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
  const names = Array.from(
    new Set(after.placements.map((p) => p.name).concat(guessNames(text))),
  ).filter(Boolean)
  const people = names.length ? names : ['Figur']
  const placements: FilmPlacement[] = people.map((name, ci, all) => {
    const matched = matchCharacterPose(name, poseId, library)
    return {
      name,
      poseId,
      poseHint: pose.label,
      depth: inferDepth(text),
      x: clamp(28 + (ci / Math.max(1, all.length - 1)) * 44, 8, 92),
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
  lineId?: string
  audioUrl?: string
}

function allDialogLines(dialog: Pick<Dialog, 'sections'>): Map<string, DialogLine> {
  const byId = new Map<string, DialogLine>()
  for (const section of dialog.sections) {
    for (const line of section.lines) byId.set(line.id, line)
  }
  return byId
}

/** Sprecher + Text unter dem Standbild, zum Vergleichen. */
export function panelDialogueLines(
  panel: FilmStoryboardPanel,
  dialog?: Pick<Dialog, 'sections'> | null,
): FilmPanelDialogueLine[] {
  if (dialog) {
    const byId = allDialogLines(dialog)
    const fromIds = panel.lineIds
      .map((id) => byId.get(id))
      .filter((line): line is DialogLine => Boolean(line?.text.trim()))
    if (fromIds.length > 0) {
      return fromIds.map((line) => ({
        speaker: line.speaker,
        text: line.text.trim(),
        lineId: line.id,
        audioUrl: line.audioUrl,
      }))
    }
  }
  const cap = panel.caption.trim()
  const match = cap.match(/^([^:]{1,48}):\s+(.+)$/)
  if (match) return [{ speaker: match[1]!.trim(), text: match[2]!.trim() }]
  if (cap) return [{ speaker: '', text: cap }]
  return []
}

/** Zeilen für die Szenen-Vorschau (Zielsprache + gespeicherte Stimme). */
export function panelSpeakLines(
  panel: FilmStoryboardPanel,
  dialog?: Pick<Dialog, 'sections'> | null,
): Array<{ id: string; speaker: string; text: string; audioUrl?: string }> {
  if (dialog) {
    const byId = allDialogLines(dialog)
    const fromIds = panel.lineIds
      .map((id) => byId.get(id))
      .filter((line): line is DialogLine => Boolean(line))
    const spoken = fromIds
      .map((line) => ({
        id: line.id,
        speaker: line.speaker || 'Sprecher',
        text: lineSpeechText(line).trim(),
        audioUrl: line.audioUrl,
      }))
      .filter((line) => line.text)
    if (spoken.length > 0) return spoken
  }
  return panelDialogueLines(panel, dialog)
    .map((line) => ({
      id: line.lineId ?? panel.id,
      speaker: line.speaker || 'Sprecher',
      text: line.text.trim(),
      audioUrl: line.audioUrl,
    }))
    .filter((line) => line.text)
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
  dialog?: Pick<Dialog, 'sections'> | null,
): FilmScenePreviewBeat[] {
  return panels.map((panel) => ({
    panelId: panel.id,
    panelIndex: panel.panelIndex,
    stillUrl: panel.stillUrl,
    caption: panel.caption,
    lines: panelSpeakLines(panel, dialog),
  }))
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
