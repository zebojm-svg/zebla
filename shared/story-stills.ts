/**
 * Standbilder mit Character-Lock — Schritt 1 Richtung Kurzfilm.
 * Stamm-Bild (Gesicht + Kleidung) zuerst, Posen nur noch per Bild-zu-Bild.
 * Kein reines Text-zu-Bild für neue Posen (sonst ein neues Gesicht).
 */

import {
  type ArmPoseId,
  type HeadAngleId,
  type LegPoseId,
} from './character-parts.js'
import { getStoryStylePrompt } from './story-art-styles.js'

export type StillsEngineId =
  | 'flux-kontext-replicate'
  | 'flux-kontext-fal'
  | 'gemini-i2i'
  | 'gemini-t2i'

export type StillPoseId =
  | 'standing-front'
  | 'standing-three-quarter'
  | 'sitting'
  | 'waving'
  | 'look-left'
  | 'look-right'
  | 'walking'

export interface StillPose {
  id: StillPoseId
  label: string
  /** Kurz, für die Bedienung */
  hintDe: string
  /** Pose-Teil des modularen Prompts */
  posePrompt: string
  headAngleId: HeadAngleId
  legPoseId: LegPoseId
  armPoseId: ArmPoseId
}

export const STORY_STILLS_STYLE_SUFFIX =
  'European comic, clean line art, watercolor shading, graphic novel, full-body, consistent facial features and outfit'

export const STORY_STILLS_BG_PROMPT =
  'Isolated full-body character sprite on a TRUE TRANSPARENT background (PNG alpha). ' +
  'Do NOT draw a checkerboard, studio wall, floor, shadow, furniture or other people. ' +
  'Clothes, hair, skin and shoes keep their real colors.'

export const STORY_STILLS_LOCK_PROMPT =
  'Keep this EXACT person from the reference image. Same face, same haircut, same hair color, ' +
  'same glasses (or none), same clothes, same shoe model and colors. ' +
  'Do not invent a sibling. Do not restyle. Only the pose may change.'

export const STILL_POSES: StillPose[] = [
  {
    id: 'standing-front',
    label: 'Stehen',
    hintDe: 'Ganzkörper, Blick zur Kamera',
    posePrompt:
      'standing full body facing camera, arms relaxed at the sides, both complete legs and both shoes visible, empty margin below the feet',
    headAngleId: 'front',
    legPoseId: 'standing',
    armPoseId: 'relaxed',
  },
  {
    id: 'standing-three-quarter',
    label: 'Schräg',
    hintDe: 'Körper leicht gedreht',
    posePrompt:
      'standing full body, three-quarter view, hips turned slightly to viewer left, both shoes visible',
    headAngleId: 'front-left',
    legPoseId: 'standing-left',
    armPoseId: 'relaxed',
  },
  {
    id: 'sitting',
    label: 'Sitzen',
    hintDe: 'Auf unsichtbarem Hocker, Füße sichtbar',
    posePrompt:
      'sitting on an invisible stool, full body, knees bent, both complete shoes hanging down, empty margin below the soles, not a waist-up crop',
    headAngleId: 'front',
    legPoseId: 'sitting-forward',
    armPoseId: 'relaxed',
  },
  {
    id: 'waving',
    label: 'Winken',
    hintDe: 'Stehen, eine Hand hebt',
    posePrompt:
      'standing full body, one hand waving hello at shoulder height, other arm relaxed, both shoes visible',
    headAngleId: 'front',
    legPoseId: 'standing',
    armPoseId: 'waving',
  },
  {
    id: 'look-left',
    label: 'Nach links',
    hintDe: 'Stehen, Kopf nach links',
    posePrompt:
      'standing full body, head turned to a left profile, body still mostly front, both shoes visible',
    headAngleId: 'side-left',
    legPoseId: 'standing',
    armPoseId: 'relaxed',
  },
  {
    id: 'look-right',
    label: 'Nach rechts',
    hintDe: 'Stehen, Kopf nach rechts',
    posePrompt:
      'standing full body, head turned to a right profile, body still mostly front, both shoes visible',
    headAngleId: 'side-right',
    legPoseId: 'standing',
    armPoseId: 'relaxed',
  },
  {
    id: 'walking',
    label: 'Gehen',
    hintDe: 'Schritt, beide Schuhe sichtbar',
    posePrompt:
      'mid-walk stride, full body, both shoes fully visible, empty margin below the feet',
    headAngleId: 'front',
    legPoseId: 'walking',
    armPoseId: 'relaxed',
  },
]

const STILL_POSE_IDS = new Set<string>(STILL_POSES.map((p) => p.id))

export function isStillPoseId(value: string): value is StillPoseId {
  return STILL_POSE_IDS.has(value)
}

export function getStillPose(id?: string | null): StillPose {
  return STILL_POSES.find((p) => p.id === id) ?? STILL_POSES[0]!
}

export interface StillsPromptParts {
  lock: string
  pose: string
  bg: string
  style: string
}

export function stillsPromptParts(opts: {
  poseId?: StillPoseId
  styleId?: string | null
  appearance?: string
  posePrompt?: string
}): StillsPromptParts {
  const pose = getStillPose(opts.poseId)
  const style =
    `${getStoryStylePrompt(opts.styleId)} ${STORY_STILLS_STYLE_SUFFIX}`.trim()
  const lock = opts.appearance
    ? `${STORY_STILLS_LOCK_PROMPT}\n${opts.appearance}`
    : STORY_STILLS_LOCK_PROMPT
  return {
    lock,
    pose: opts.posePrompt?.trim() || pose.posePrompt,
    bg: STORY_STILLS_BG_PROMPT,
    style,
  }
}

/** Modularer Prompt: [lock] + [pose] + [bg] + [style] */
export function buildModularStillPrompt(opts: {
  poseId?: StillPoseId
  styleId?: string | null
  appearance?: string
  posePrompt?: string
}): string {
  const parts = stillsPromptParts(opts)
  return (
    `[lock] ${parts.lock}\n` +
    `[pose] ${parts.pose}\n` +
    `[bg] ${parts.bg}\n` +
    `[style] ${parts.style}`
  )
}

/**
 * Kurze Edit-Anweisung für FLUX Kontext (sieht das Stamm-Bild).
 * Kein Text-zu-Bild — nur Pose ändern, Identität halten.
 */
export function buildKontextEditPrompt(opts: {
  poseId?: StillPoseId
  styleId?: string | null
  appearance?: string
  posePrompt?: string
}): string {
  const parts = stillsPromptParts(opts)
  const identity = opts.appearance ? ` Identity: ${opts.appearance}` : ''
  return (
    `${parts.lock}${identity} ` +
    `Change ONLY the pose to: ${parts.pose}. ` +
    `${parts.bg} ${parts.style}`
  )
}

export interface StillsEngineInfo {
  id: StillsEngineId
  ready: boolean
  labelDe: string
  hintDe: string
}

export function stillsEngineFromEnv(env: Record<string, string | undefined>): {
  lockEngine: StillsEngineId
  masterEngine: StillsEngineId
  engines: StillsEngineInfo[]
} {
  const replicate = Boolean(env.REPLICATE_API_TOKEN?.trim())
  const fal = Boolean(env.FAL_KEY?.trim())
  const gemini = Boolean(
    env.GEMINI_API_KEY?.trim() || env.GOOGLE_GENERATIVE_AI_API_KEY?.trim(),
  )

  const engines: StillsEngineInfo[] = [
    {
      id: 'flux-kontext-replicate',
      ready: replicate,
      labelDe: 'FLUX Kontext (Replicate)',
      hintDe: 'Hält Gesicht und Kleidung fest. In Vercel: REPLICATE_API_TOKEN.',
    },
    {
      id: 'flux-kontext-fal',
      ready: fal,
      labelDe: 'FLUX Kontext (Fal)',
      hintDe: 'Gleiche Technik über Fal. In Vercel: FAL_KEY.',
    },
    {
      id: 'gemini-i2i',
      ready: gemini,
      labelDe: 'Gemini mit Foto',
      hintDe:
        'Besser als nur Text, aber FLUX hält die Figur fester. Stamm-Bild wird trotzdem mitgegeben.',
    },
    {
      id: 'gemini-t2i',
      ready: gemini,
      labelDe: 'Gemini ohne Foto',
      hintDe: 'Nur für das erste Stamm-Bild. Danach nie mehr für neue Posen.',
    },
  ]

  const lockEngine: StillsEngineId = replicate
    ? 'flux-kontext-replicate'
    : fal
      ? 'flux-kontext-fal'
      : 'gemini-i2i'

  return { lockEngine, masterEngine: 'gemini-t2i', engines }
}

export function stillsEngineLabelDe(id: StillsEngineId): string {
  if (id === 'flux-kontext-replicate') return 'FLUX Kontext (Replicate)'
  if (id === 'flux-kontext-fal') return 'FLUX Kontext (Fal)'
  if (id === 'gemini-i2i') return 'Gemini mit Foto'
  return 'Gemini (erstes Stamm-Bild)'
}
