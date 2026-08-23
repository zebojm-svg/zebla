import {
  characterBaseName,
  isArmPoseId,
  isFaceExpressionId,
  isHeadAngleId,
  isLegPoseId,
  normalizeArmPoseId,
  normalizeFaceExpressionId,
  poseVariantLabel,
  sameLegSilhouette,
  type ArmPoseId,
  type FaceExpressionId,
  type HeadAngleId,
  type LegPoseId,
} from '../../shared/character-parts'
import type { StoryLibraryAsset } from '../../shared/story-types'
import { isCharacterRig, type CharacterRig } from '../../shared/character-rig'

export type PoseVariantSource = {
  imageUrl: string
  name: string
  libraryAssetId?: string
  headAngle?: HeadAngleId
  legPose?: LegPoseId
  armPose?: ArmPoseId
  face?: FaceExpressionId
  rig?: CharacterRig
}

export type PoseVariant = {
  key: string
  imageUrl: string
  assetName: string
  libraryAssetId?: string
  headAngle?: HeadAngleId
  legPose?: LegPoseId
  armPose?: ArmPoseId
  face?: FaceExpressionId
  label: string
  rig?: CharacterRig
}

function normalizeVariant(input: PoseVariantSource): PoseVariant | null {
  const head =
    input.headAngle && isHeadAngleId(input.headAngle) ? input.headAngle : undefined
  const leg = input.legPose && isLegPoseId(input.legPose) ? input.legPose : undefined
  const arm = input.armPose && isArmPoseId(input.armPose) ? input.armPose : undefined
  const face = input.face && isFaceExpressionId(input.face) ? input.face : undefined
  if (!head && !leg && !arm && !face && !input.imageUrl) return null
  return {
    key: input.libraryAssetId ?? input.imageUrl,
    imageUrl: input.imageUrl,
    assetName: input.name,
    libraryAssetId: input.libraryAssetId,
    headAngle: head,
    legPose: leg,
    armPose: arm,
    face,
    label: poseVariantLabel(head, leg, arm, face),
    rig: isCharacterRig(input.rig) ? input.rig : undefined,
  }
}

function variantArm(v: PoseVariant): ArmPoseId {
  return normalizeArmPoseId(v.armPose)
}

function variantFace(v: PoseVariant): FaceExpressionId {
  return normalizeFaceExpressionId(v.face)
}

/** Varianten derselben Figur aus Sitzung + Bibliothek (gleicher Basisname). */
export function collectPoseVariants(
  baseName: string,
  libraryCharacters: StoryLibraryAsset[],
  sessionCharacters: PoseVariantSource[],
): PoseVariant[] {
  const needle = characterBaseName(baseName).toLowerCase()
  if (!needle) return []

  const byKey = new Map<string, PoseVariant>()

  for (const item of sessionCharacters) {
    if (characterBaseName(item.name).toLowerCase() !== needle) continue
    const v = normalizeVariant(item)
    if (v) byKey.set(v.key, v)
  }

  for (const item of libraryCharacters) {
    if (characterBaseName(item.name).toLowerCase() !== needle) continue
    const v = normalizeVariant({
      imageUrl: item.imageUrl,
      name: item.name,
      libraryAssetId: item.id,
      headAngle: item.headAngleId as HeadAngleId | undefined,
      legPose: item.legPoseId as LegPoseId | undefined,
      armPose: item.armPoseId as ArmPoseId | undefined,
      face: item.faceExpressionId as FaceExpressionId | undefined,
      rig: item.rig,
    })
    if (v) byKey.set(v.key, v)
  }

  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'de'))
}

export function findPoseVariant(
  variants: PoseVariant[],
  opts: { headAngle?: HeadAngleId; legPose?: LegPoseId; armPose?: ArmPoseId },
): PoseVariant | undefined {
  const exact = findExactPoseVariant(variants, opts)
  if (exact) return exact
  if (opts.headAngle != null && opts.legPose != null) {
    const headLeg = variants.find(
      (v) => v.headAngle === opts.headAngle && v.legPose === opts.legPose,
    )
    if (headLeg) return headLeg
  }
  if (opts.headAngle != null) {
    const byHead = variants.find((v) => v.headAngle === opts.headAngle)
    if (byHead) return byHead
  }
  if (opts.legPose != null) {
    return variants.find((v) => v.legPose === opts.legPose)
  }
  if (opts.armPose != null) {
    return variants.find((v) => variantArm(v) === opts.armPose)
  }
  return undefined
}

/** Nur die genaue Kombination — nicht «irgendeine Figur mit diesem Kopf». */
export function findExactPoseVariant(
  variants: PoseVariant[],
  opts: {
    headAngle?: HeadAngleId
    legPose?: LegPoseId
    armPose?: ArmPoseId
    face?: FaceExpressionId
  },
): PoseVariant | undefined {
  return variants.find(
    (v) =>
      (opts.headAngle == null || v.headAngle === opts.headAngle) &&
      (opts.legPose == null || v.legPose === opts.legPose) &&
      (opts.armPose == null || variantArm(v) === opts.armPose) &&
      (opts.face == null || variantFace(v) === opts.face),
  )
}

export function findRiggedHead(
  variants: PoseVariant[],
  head: HeadAngleId,
  face: FaceExpressionId = 'normal',
): PoseVariant | undefined {
  return (
    variants.find((v) => v.headAngle === head && variantFace(v) === face && v.rig) ??
    variants.find((v) => v.headAngle === head && v.rig)
  )
}

export function findRiggedLegs(
  variants: PoseVariant[],
  leg: LegPoseId,
): PoseVariant | undefined {
  return variants.find((v) => v.legPose === leg && v.rig)
}

export function findRiggedTorso(
  variants: PoseVariant[],
  arm: ArmPoseId,
  preferLeg?: LegPoseId,
): PoseVariant | undefined {
  const matches = variants.filter((v) => variantArm(v) === arm && v.rig)
  if (preferLeg) {
    const same = matches.find((v) => v.legPose && sameLegSilhouette(v.legPose, preferLeg))
    return same
  }
  return matches[0]
}

export type PoseApply =
  | { action: 'swap'; variant: PoseVariant }
  | { action: 'mix'; part: 'head' | 'torso' | 'legs'; donor: PoseVariant }
  | { action: 'generate' }

/** Rad-Klick: vorhandenes Teil aufsetzen, sonst genau tauschen, sonst zeichnen. */
export function decidePoseApply(opts: {
  memberHasRig: boolean
  current: { head: HeadAngleId; leg: LegPoseId; arm: ArmPoseId; face: FaceExpressionId }
  next: { head: HeadAngleId; leg: LegPoseId; arm: ArmPoseId; face: FaceExpressionId }
  variants: PoseVariant[]
}): PoseApply {
  const { memberHasRig, current, next, variants } = opts
  const headPartChanged = next.head !== current.head || next.face !== current.face
  const legChanged = next.leg !== current.leg
  const armChanged = next.arm !== current.arm
  const changed = [headPartChanged, legChanged, armChanged].filter(Boolean).length

  if (memberHasRig && changed === 1) {
    if (headPartChanged) {
      const donor = findRiggedHead(variants, next.head, next.face)
      if (donor && donor.headAngle === next.head && variantFace(donor) === next.face) {
        return { action: 'mix', part: 'head', donor }
      }
    } else if (legChanged && sameLegSilhouette(current.leg, next.leg)) {
      const donor = findRiggedLegs(variants, next.leg)
      if (donor) return { action: 'mix', part: 'legs', donor }
    } else if (armChanged) {
      const donor = findRiggedTorso(variants, next.arm, current.leg)
      if (donor) return { action: 'mix', part: 'torso', donor }
    }
  }

  const exact = findExactPoseVariant(variants, {
    headAngle: next.head,
    legPose: next.leg,
    armPose: next.arm,
    face: next.face,
  })
  if (exact) return { action: 'swap', variant: exact }
  return { action: 'generate' }
}

/** «+» am Rad: dieses Teil existiert schon (egal welche Kombi). */
export function allHeadAngles(variants: PoseVariant[]): HeadAngleId[] {
  const ids = new Set<HeadAngleId>()
  for (const v of variants) if (v.headAngle) ids.add(v.headAngle)
  return [...ids]
}

export function allLegPoses(variants: PoseVariant[]): LegPoseId[] {
  const ids = new Set<LegPoseId>()
  for (const v of variants) if (v.legPose) ids.add(v.legPose)
  return [...ids]
}

export function allArmPoses(variants: PoseVariant[]): ArmPoseId[] {
  const ids = new Set<ArmPoseId>()
  for (const v of variants) ids.add(variantArm(v))
  return [...ids]
}

export function allFaceExpressions(variants: PoseVariant[]): FaceExpressionId[] {
  const ids = new Set<FaceExpressionId>()
  for (const v of variants) ids.add(variantFace(v))
  return [...ids]
}

export function availableHeadAngles(
  variants: PoseVariant[],
  legPose?: LegPoseId,
  armPose?: ArmPoseId,
): HeadAngleId[] {
  const ids = new Set<HeadAngleId>()
  for (const v of variants) {
    if (!v.headAngle) continue
    if (legPose && v.legPose && v.legPose !== legPose) continue
    if (armPose && variantArm(v) !== armPose) continue
    ids.add(v.headAngle)
  }
  return [...ids]
}

export function availableLegPoses(
  variants: PoseVariant[],
  headAngle?: HeadAngleId,
  armPose?: ArmPoseId,
): LegPoseId[] {
  const ids = new Set<LegPoseId>()
  for (const v of variants) {
    if (!v.legPose) continue
    if (headAngle && v.headAngle && v.headAngle !== headAngle) continue
    if (armPose && variantArm(v) !== armPose) continue
    ids.add(v.legPose)
  }
  return [...ids]
}

export function availableArmPoses(
  variants: PoseVariant[],
  headAngle?: HeadAngleId,
  legPose?: LegPoseId,
): ArmPoseId[] {
  const ids = new Set<ArmPoseId>()
  for (const v of variants) {
    if (headAngle && v.headAngle && v.headAngle !== headAngle) continue
    if (legPose && v.legPose && v.legPose !== legPose) continue
    ids.add(variantArm(v))
  }
  return [...ids]
}

export function uniqueCastCandidates(
  libraryCharacters: StoryLibraryAsset[],
  sessionCharacters: PoseVariantSource[],
): PoseVariant[] {
  const names = new Set<string>()
  for (const item of sessionCharacters) names.add(characterBaseName(item.name).toLowerCase())
  for (const item of libraryCharacters) names.add(characterBaseName(item.name).toLowerCase())

  const out: PoseVariant[] = []
  for (const name of names) {
    const variants = collectPoseVariants(name, libraryCharacters, sessionCharacters)
    if (variants.length === 0) continue
    const standing =
      findPoseVariant(variants, { headAngle: 'front', legPose: 'standing', armPose: 'relaxed' }) ??
      findPoseVariant(variants, { headAngle: 'front', legPose: 'standing' }) ??
      findPoseVariant(variants, { legPose: 'standing' })
    const preferred =
      (standing?.rig ? standing : variants.find((v) => v.rig)) ?? standing ?? variants[0]
    if (preferred) out.push(preferred)
  }
  return out.sort((a, b) =>
    characterBaseName(a.assetName).localeCompare(characterBaseName(b.assetName), 'de'),
  )
}

/** Immer dasselbe Referenzbild für neue Posen — nicht das zuletzt gezeichnete (kann schon abweichen). */
export function pickIdentityReference(
  baseName: string,
  libraryCharacters: StoryLibraryAsset[],
  sessionCharacters: PoseVariantSource[],
): string | undefined {
  const variants = collectPoseVariants(baseName, libraryCharacters, sessionCharacters)
  const hero =
    findPoseVariant(variants, { headAngle: 'front', legPose: 'standing', armPose: 'relaxed' }) ??
    findPoseVariant(variants, { headAngle: 'front', legPose: 'standing' }) ??
    findPoseVariant(variants, { legPose: 'standing' }) ??
    variants.find((v) => v.rig) ??
    variants[0]
  return hero?.imageUrl
}

export type CharacterIdentity = {
  baseName: string
  preview: PoseVariant
  variantCount: number
  libraryIds: string[]
}

/** Eine Karte pro Person, egal wie viele Posen gespeichert sind. */
export function listCharacterIdentities(
  libraryCharacters: StoryLibraryAsset[],
  sessionCharacters: PoseVariantSource[],
): CharacterIdentity[] {
  const previews = uniqueCastCandidates(libraryCharacters, sessionCharacters)
  return previews.map((preview) => {
    const baseName = characterBaseName(preview.assetName)
    const variants = collectPoseVariants(baseName, libraryCharacters, sessionCharacters)
    return {
      baseName,
      preview,
      variantCount: Math.max(1, variants.length),
      libraryIds: variants.map((v) => v.libraryAssetId).filter((id): id is string => Boolean(id)),
    }
  })
}
