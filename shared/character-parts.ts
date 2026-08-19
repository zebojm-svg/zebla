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
  { id: 'front-left', label: 'Schräg vorne links', promptHint: 'head turned 30 degrees to viewer left, three-quarter front view' },
  { id: 'front-right', label: 'Schräg vorne rechts', promptHint: 'head turned 30 degrees to viewer right, three-quarter front view' },
  { id: 'side-left', label: 'Profil links', promptHint: 'left profile view of head' },
  { id: 'side-right', label: 'Profil rechts', promptHint: 'right profile view of head' },
  { id: 'back', label: 'Hinten', promptHint: 'back of head, facing away from camera' },
  { id: 'back-left', label: 'Schräg hinten links', promptHint: 'head turned away, three-quarter back view left' },
  { id: 'back-right', label: 'Schräg hinten rechts', promptHint: 'head turned away, three-quarter back view right' },
]

export const LEG_POSES: CharacterPartDef[] = [
  { id: 'standing', label: 'Stehen', promptHint: 'standing straight, feet on ground' },
  { id: 'sitting-forward', label: 'Sitzen (Beine vorne)', promptHint: 'sitting on sofa, legs forward, knees bent' },
  { id: 'sitting-cross', label: 'Schneidersitz', promptHint: 'cross-legged sitting on floor or sofa' },
  { id: 'sitting-side', label: 'Sitzen (Beine zur Seite)', promptHint: 'sitting with legs to one side' },
  { id: 'sitting-diagonal-back', label: 'Sitzen schräg hinten', promptHint: 'sitting angled, one knee up, relaxed pose' },
  { id: 'walking', label: 'Gehen', promptHint: 'mid-walk stride pose' },
  { id: 'kneeling', label: 'Kniend', promptHint: 'kneeling on one knee' },
]

/** Geplante Pose-Matrix: Kopf × Beine (später aus Bibliothek zusammensetzen) */
export function poseMatrixSize(): { heads: number; legs: number; total: number } {
  return { heads: HEAD_ANGLES.length, legs: LEG_POSES.length, total: HEAD_ANGLES.length * LEG_POSES.length }
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
