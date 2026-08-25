/**
 * Film-Projekt: Dialog → billiges Storyboard, Bibliothek zuerst.
 * Posen und Hintergründe werden wiederverwendet (spiegeln/zoomen),
 * teure KI nur wenn etwas fehlt.
 */

import { characterBaseName } from './character-parts.js'
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
  sceneIndex: number
  panelIndex: number
  sectionId: string
  lineIds: string[]
  caption: string
  imageCue: string
  soundCue: string
  speechCue: string
  settingHint: string
  placements: FilmPlacement[]
  background: FilmBackground
  directorNote?: string
}

export interface FilmStoryboard {
  version: 1
  source: FilmBoardSource
  panels: FilmStoryboardPanel[]
  updatedAt: string
  summaryDe?: string
}

export interface FilmDraftPanel {
  sectionId: string
  lineIds: string[]
  caption?: string
  imageCue?: string
  soundCue?: string
  speechCue?: string
  settingHint?: string
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

function defaultSetting(dialog: Dialog, section: DialogSection): string {
  return (
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
): FilmStoryboard {
  const sectionIndex = new Map(dialog.sections.map((s, i) => [s.id, i]))
  const panels: FilmStoryboardPanel[] = drafts.map((draft, i) => {
    const sceneIndex = sectionIndex.get(draft.sectionId) ?? 0
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

    return {
      id: `p-${i + 1}-${draft.sectionId.slice(0, 8)}`,
      sceneIndex,
      panelIndex: i + 1,
      sectionId: draft.sectionId,
      lineIds: draft.lineIds,
      caption: draft.caption?.trim() || `Bild ${i + 1}`,
      imageCue: draft.imageCue?.trim() || '',
      soundCue: draft.soundCue?.trim() || '',
      speechCue: draft.speechCue?.trim() || '',
      settingHint,
      placements,
      background: matchBackground(settingHint, library),
    }
  })

  const missing = panels.filter(
    (p) =>
      p.background.match === 'missing' || p.placements.some((pl) => pl.match === 'missing'),
  ).length

  return {
    version: 1,
    source,
    panels,
    updatedAt: new Date().toISOString(),
    summaryDe:
      missing === 0
        ? `${panels.length} Bilder — alles aus der Bibliothek, ohne neue Zeichnung.`
        : `${panels.length} Bilder, ${missing} brauchen noch eine neue Zeichnung.`,
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

export function boardNeedsDrawing(board: FilmStoryboard | undefined): number {
  if (!board) return 0
  return board.panels.filter(
    (p) =>
      p.background.match === 'missing' || p.placements.some((pl) => pl.match === 'missing'),
  ).length
}

export function isFilmStoryboard(value: unknown): value is FilmStoryboard {
  if (!value || typeof value !== 'object') return false
  const v = value as FilmStoryboard
  return v.version === 1 && Array.isArray(v.panels)
}
