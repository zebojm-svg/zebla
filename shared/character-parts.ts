/**
 * Modulare Figuren-Teile für die Bibliothek.
 * Kopf, Rumpf und Beine hängen am Hals-/Hüftgelenk zusammen.
 * Eine neue Ganzkörper-Zeichnung braucht man nur, wenn die Silhouette
 * sich stark ändert (z.B. Sitzen statt Stehen) — den Kopf kann man
 * drehen oder aus einer anderen Pose derselben Figur setzen.
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
  | 'standing-left'
  | 'standing-right'
  | 'sitting-forward'
  | 'sitting-left'
  | 'sitting-right'
  | 'sitting-cross'
  | 'sitting-side'
  | 'sitting-diagonal-back'
  | 'walking'
  | 'kneeling'

export type ArmPoseId =
  | 'relaxed'
  | 'crossed'
  | 'waving'
  | 'cheering'
  | 'shrug'
  | 'talking'
  | 'hips'

export interface CharacterPartDef<T extends string = string> {
  id: T
  label: string
  /** Prompt-Zusatz für KI-Generierung */
  promptHint: string
}

export const HEAD_ANGLES: CharacterPartDef<HeadAngleId>[] = [
  { id: 'front', label: 'Geradeaus', promptHint: 'face toward camera, front view head' },
  {
    id: 'front-left',
    label: 'Schräg links',
    promptHint: 'head turned 30 degrees to viewer left, three-quarter front view',
  },
  {
    id: 'front-right',
    label: 'Schräg rechts',
    promptHint: 'head turned 30 degrees to viewer right, three-quarter front view',
  },
  { id: 'side-left', label: 'Links', promptHint: 'left profile view of head' },
  { id: 'side-right', label: 'Rechts', promptHint: 'right profile view of head' },
  { id: 'back', label: 'Hinten', promptHint: 'back of head, facing away from camera' },
  {
    id: 'back-left',
    label: 'Hinten links',
    promptHint: 'head turned away, three-quarter back view left',
  },
  {
    id: 'back-right',
    label: 'Hinten rechts',
    promptHint: 'head turned away, three-quarter back view right',
  },
]

export const LEG_POSES: CharacterPartDef<LegPoseId>[] = [
  {
    id: 'standing',
    label: 'Stehen',
    promptHint:
      'standing full body facing camera, camera pulled back, both complete legs and both shoes with soles fully visible, empty studio margin below the feet',
  },
  {
    id: 'standing-left',
    label: 'Hüfte nach links',
    promptHint:
      'standing full body, hips and torso turned toward viewer left, both complete legs and both shoes fully visible, empty studio margin below the feet',
  },
  {
    id: 'standing-right',
    label: 'Hüfte nach rechts',
    promptHint:
      'standing full body, hips and torso turned toward viewer right, both complete legs and both shoes fully visible, empty studio margin below the feet',
  },
  {
    id: 'sitting-forward',
    label: 'Sitzen nach vorn',
    promptHint:
      'sitting on an invisible seat BUT this is still a FULL BODY shot: thighs, knees, calves, ankles and both complete shoes hanging down toward the camera in the lower third of the image, empty studio margin below the soles, not a waist-up portrait, not cropped at the knees, torso upright',
  },
  {
    id: 'sitting-left',
    label: 'Sitzen nach links',
    promptHint:
      'sitting on an invisible seat, legs and knees angled to viewer left, FULL BODY including both complete shoes hanging down, empty studio margin below the soles, not cropped at the knees',
  },
  {
    id: 'sitting-right',
    label: 'Sitzen nach rechts',
    promptHint:
      'sitting on an invisible seat, legs and knees angled to viewer right, FULL BODY including both complete shoes hanging down, empty studio margin below the soles, not cropped at the knees',
  },
  { id: 'sitting-cross', label: 'Schneidersitz', promptHint: 'cross-legged sitting on floor or sofa, both shoes visible' },
  { id: 'sitting-side', label: 'Sitzen, Beine zur Seite', promptHint: 'sitting with both legs tucked to one side, both shoes visible' },
  {
    id: 'sitting-diagonal-back',
    label: 'Sitzen schräg hinten',
    promptHint: 'sitting angled away, one knee up, relaxed pose, both shoes visible',
  },
  { id: 'walking', label: 'Gehen', promptHint: 'mid-walk stride pose, both shoes fully visible' },
  { id: 'kneeling', label: 'Kniend', promptHint: 'kneeling on one knee, both shoes visible' },
]

export const ARM_POSES: CharacterPartDef<ArmPoseId>[] = [
  {
    id: 'relaxed',
    label: 'Locker',
    promptHint: 'arms relaxed naturally at the sides, both hands fully visible, fingers slightly apart so gaps between fingers are visible against the studio backdrop',
  },
  {
    id: 'crossed',
    label: 'Verschränkt',
    promptHint: 'arms folded/crossed over the chest, both hands visible, gaps between arms and torso visible against the studio backdrop',
  },
  {
    id: 'waving',
    label: 'Winken',
    promptHint: 'one hand waving hello at shoulder height, other arm relaxed, fingers spread so gaps between fingers are visible',
  },
  {
    id: 'cheering',
    label: 'Jubelnd',
    promptHint: 'both arms raised in the air cheering, hands open, gaps between arms and head visible against the studio backdrop',
  },
  {
    id: 'shrug',
    label: 'Tja (Achselzucken)',
    promptHint: 'shrugging with both palms up at shoulder height as if saying well / tja, elbows out, gaps under the arms visible against the studio backdrop',
  },
  {
    id: 'talking',
    label: 'Gestikulierend',
    promptHint: 'one hand gesturing while talking, conversational pose, both hands visible',
  },
  {
    id: 'hips',
    label: 'Hände in die Hüfte',
    promptHint: 'both hands on hips, elbows out, triangular gaps between arms and torso visible against the studio backdrop',
  },
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
    label: 'Dialog-Set (ganze Figur)',
    description: 'Stehen, ganze Figur inkl. Schuhe × 5 Blickrichtungen — Arme locker, Füße bleiben im Bild',
    fixedLegPose: 'standing',
    heads: 'dialogue',
    legs: 'fixed',
  },
  {
    id: 'heads-for-leg',
    label: 'Alle Köpfe (gewählte Bein-Pose)',
    description: '8 Blickrichtungen für die aktuell gewählte Bein-Pose (gewählte Arme)',
    heads: 'all',
    legs: 'fixed',
  },
  {
    id: 'full-matrix',
    label: 'Volle Matrix (Kopf × Beine)',
    description: 'Alle Bein-Posen × alle Köpfe, Arme locker (dauert, teuer — Arme extra per Button)',
    heads: 'all',
    legs: 'all',
  },
]

export function poseSetCombos(
  setId: PoseSetId,
  selectedLegPose: LegPoseId,
  selectedArmPose: ArmPoseId = 'relaxed',
): Array<{ head: HeadAngleId; leg: LegPoseId; arm: ArmPoseId }> {
  const set = POSE_SETS.find((s) => s.id === setId)
  if (!set) return []
  const heads =
    set.heads === 'dialogue'
      ? DIALOGUE_HEAD_ANGLES
      : HEAD_ANGLES.map((h) => h.id)
  const legs: LegPoseId[] =
    set.legs === 'all' ? LEG_POSES.map((l) => l.id) : [set.fixedLegPose ?? selectedLegPose]
  const arm = set.id === 'sofa-dialogue' ? 'relaxed' : selectedArmPose
  const out: Array<{ head: HeadAngleId; leg: LegPoseId; arm: ArmPoseId }> = []
  for (const leg of legs) {
    for (const head of heads) {
      out.push({ head, leg, arm })
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

/** Geplante Pose-Matrix: Kopf × Beine × Arme */
export function poseMatrixSize(): { heads: number; legs: number; arms: number; total: number } {
  return {
    heads: HEAD_ANGLES.length,
    legs: LEG_POSES.length,
    arms: ARM_POSES.length,
    total: HEAD_ANGLES.length * LEG_POSES.length * ARM_POSES.length,
  }
}

/** «Julien · Geradeaus · Stehen» → «Julien» */
export function characterBaseName(name: string): string {
  return name.split(' · ')[0]?.trim() || name.trim()
}

export function poseVariantLabel(head?: HeadAngleId, leg?: LegPoseId, arm?: ArmPoseId): string {
  const parts = [
    head ? headAngleLabel(head) : null,
    leg ? legPoseLabel(leg) : null,
    arm && arm !== 'relaxed' ? armPoseLabel(arm) : null,
  ].filter(Boolean)
  return parts.join(' · ') || 'Pose'
}

export function headAngleLabel(id: HeadAngleId): string {
  return HEAD_ANGLES.find((h) => h.id === id)?.label ?? id
}

export function legPoseLabel(id: LegPoseId): string {
  return LEG_POSES.find((l) => l.id === id)?.label ?? id
}

export function armPoseLabel(id: ArmPoseId): string {
  return ARM_POSES.find((a) => a.id === id)?.label ?? id
}

export function legPosePrompt(id: LegPoseId): string {
  return LEG_POSES.find((l) => l.id === id)?.promptHint ?? 'standing naturally'
}

export function headAnglePrompt(id: HeadAngleId): string {
  return HEAD_ANGLES.find((h) => h.id === id)?.promptHint ?? 'face toward camera, front view head'
}

export function armPosePrompt(id: ArmPoseId): string {
  return ARM_POSES.find((a) => a.id === id)?.promptHint ?? 'arms relaxed at the sides'
}

export function isLegPoseId(value: string): value is LegPoseId {
  return LEG_POSES.some((p) => p.id === value)
}

export function isHeadAngleId(value: string): value is HeadAngleId {
  return HEAD_ANGLES.some((h) => h.id === value)
}

export function isArmPoseId(value: string): value is ArmPoseId {
  return ARM_POSES.some((p) => p.id === value)
}

export function normalizeArmPoseId(value?: string | null): ArmPoseId {
  return value && isArmPoseId(value) ? value : 'relaxed'
}

/** Sitzen und Stehen nicht ineinander mischen — die Hüfte sitzt anders. */
export function sameLegSilhouette(a: LegPoseId, b: LegPoseId): boolean {
  return a.startsWith('sitting') === b.startsWith('sitting')
}
