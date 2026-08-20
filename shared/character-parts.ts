/**
 * Modulare Figuren-Teile für die Bibliothek.
 * Ziel: Kopf + Körper + Beine separat erzeugen und in Szenen kombinieren.
 */

export type HeadAngleId =
  | 'front'
  | 'front-left'
  | 'front-right'
  | 'side-left'
  | 'side-right'
  | 'back'
  | 'back-left'
  | 'back-right'

export type LegPoseId =
  | 'standing'
  | 'sitting-forward'
  | 'sitting-cross'
  | 'sitting-side'
  | 'sitting-diagonal-back'
  | 'walking'
  | 'kneeling'

export interface CharacterPartDef {
  id: HeadAngleId | LegPoseId
  label: string
  /** Prompt-Zusatz für KI-Generierung */
  promptHint: string
}

export const HEAD_ANGLES: CharacterPartDef[] = [
  { id: 'front', label: 'Vorne', promptHint: 'face toward camera, front view head' },
  {
    id: 'front-left',
    label: 'Schräg vorne links',
    promptHint: 'head turned 30 degrees to viewer left, three-quarter front view',
  },
  {
    id: 'front-right',
    label: 'Schräg vorne rechts',
    promptHint: 'head turned 30 degrees to viewer right, three-quarter front view',
  },
  { id: 'side-left', label: 'Profil links', promptHint: 'left profile view of head' },
  { id: 'side-right', label: 'Profil rechts', promptHint: 'right profile view of head' },
  { id: 'back', label: 'Hinten', promptHint: 'back of head, facing away from camera' },
  {
    id: 'back-left',
    label: 'Schräg hinten links',
    promptHint: 'head turned away, three-quarter back view left',
  },
  {
    id: 'back-right',
    label: 'Schräg hinten rechts',
    promptHint: 'head turned away, three-quarter back view right',
  },
]

export const LEG_POSES: CharacterPartDef[] = [
  { id: 'standing', label: 'Stehen', promptHint: 'standing straight, feet on ground' },
  {
    id: 'sitting-forward',
    label: 'Sitzen (Beine vorne)',
    promptHint: 'sitting on sofa, legs forward, knees bent, torso upright',
  },
  { id: 'sitting-cross', label: 'Schneidersitz', promptHint: 'cross-legged sitting on floor or sofa' },
  { id: 'sitting-side', label: 'Sitzen (Beine zur Seite)', promptHint: 'sitting with legs to one side' },
  {
    id: 'sitting-diagonal-back',
    label: 'Sitzen schräg hinten',
    promptHint: 'sitting angled, one knee up, relaxed pose',
  },
  { id: 'walking', label: 'Gehen', promptHint: 'mid-walk stride pose' },
  { id: 'kneeling', label: 'Kniend', promptHint: 'kneeling on one knee' },
]

/** Häufigste Blickrichtungen für Dialoge (Sofa) */
export const DIALOGUE_HEAD_ANGLES: HeadAngleId[] = [
  'front',
  'front-left',
  'front-right',
  'side-left',
  'side-right',
]

export type PoseSetId = 'sofa-dialogue' | 'heads-for-leg' | 'full-matrix'

export interface PoseSetDef {
  id: PoseSetId
  label: string
  description: string
  /** Wenn gesetzt, feste Bein-Pose; sonst generateLegPose aus UI */
  fixedLegPose?: LegPoseId
  heads: 'dialogue' | 'all'
  legs: 'fixed' | 'all'
}

export const POSE_SETS: PoseSetDef[] = [
  {
    id: 'sofa-dialogue',
    label: 'Sofa-Dialog-Set',
    description: 'Sitzen (Beine vorne) × 5 Blickrichtungen — ideal für Wohnzimmer',
    fixedLegPose: 'sitting-forward',
    heads: 'dialogue',
    legs: 'fixed',
  },
  {
    id: 'heads-for-leg',
    label: 'Alle Köpfe (gewählte Bein-Pose)',
    description: '8 Blickrichtungen für die aktuell gewählte Bein-Pose',
    heads: 'all',
    legs: 'fixed',
  },
  {
    id: 'full-matrix',
    label: 'Volle Matrix',
    description: 'Alle Bein-Posen × alle Köpfe (dauert, teuer)',
    heads: 'all',
    legs: 'all',
  },
]

export function poseSetCombos(
  setId: PoseSetId,
  selectedLegPose: LegPoseId,
): Array<{ head: HeadAngleId; leg: LegPoseId }> {
  const set = POSE_SETS.find((s) => s.id === setId)
  if (!set) return []
  const heads =
    set.heads === 'dialogue'
      ? DIALOGUE_HEAD_ANGLES
      : (HEAD_ANGLES.map((h) => h.id) as HeadAngleId[])
  const legs: LegPoseId[] =
    set.legs === 'all'
      ? (LEG_POSES.map((l) => l.id) as LegPoseId[])
      : [set.fixedLegPose ?? selectedLegPose]
  const out: Array<{ head: HeadAngleId; leg: LegPoseId }> = []
  for (const leg of legs) {
    for (const head of heads) {
      out.push({ head, leg })
    }
  }
  return out
}

export function poseSetCount(setId: PoseSetId): number {
  const set = POSE_SETS.find((s) => s.id === setId)
  if (!set) return 0
  const headN = set.heads === 'dialogue' ? DIALOGUE_HEAD_ANGLES.length : HEAD_ANGLES.length
  const legN = set.legs === 'all' ? LEG_POSES.length : 1
  return headN * legN
}

/** Geplante Pose-Matrix: Kopf × Beine */
export function poseMatrixSize(): { heads: number; legs: number; total: number } {
  return { heads: HEAD_ANGLES.length, legs: LEG_POSES.length, total: HEAD_ANGLES.length * LEG_POSES.length }
}

/** «Julien · Vorne · Sitzen» → «Julien» */
export function characterBaseName(name: string): string {
  return name.split(' · ')[0]?.trim() || name.trim()
}

export function poseVariantLabel(head?: HeadAngleId, leg?: LegPoseId): string {
  const parts = [head ? headAngleLabel(head) : null, leg ? legPoseLabel(leg) : null].filter(Boolean)
  return parts.join(' · ') || 'Pose'
}

export function headAngleLabel(id: HeadAngleId): string {
  return HEAD_ANGLES.find((h) => h.id === id)?.label ?? id
}

export function legPoseLabel(id: LegPoseId): string {
  return LEG_POSES.find((l) => l.id === id)?.label ?? id
}

export function legPosePrompt(id: LegPoseId): string {
  return LEG_POSES.find((l) => l.id === id)?.promptHint ?? 'standing naturally'
}

export function headAnglePrompt(id: HeadAngleId): string {
  return HEAD_ANGLES.find((h) => h.id === id)?.promptHint ?? 'face toward camera, front view head'
}

export function isLegPoseId(value: string): value is LegPoseId {
  return LEG_POSES.some((p) => p.id === value)
}

export function isHeadAngleId(value: string): value is HeadAngleId {
  return HEAD_ANGLES.some((h) => h.id === value)
}
