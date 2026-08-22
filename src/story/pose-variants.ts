import {
  characterBaseName,
  isArmPoseId,
  isHeadAngleId,
  isLegPoseId,
  normalizeArmPoseId,
  poseVariantLabel,
  type ArmPoseId,
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
  label: string
  rig?: CharacterRig
}

function normalizeVariant(input: PoseVariantSource): PoseVariant | null {
  const head =
    input.headAngle && isHeadAngleId(input.headAngle) ? input.headAngle : undefined
  const leg = input.legPose && isLegPoseId(input.legPose) ? input.legPose : undefined
  const arm = input.armPose && isArmPoseId(input.armPose) ? input.armPose : undefined
  if (!head && !leg && !arm && !input.imageUrl) return null
  return {
    key: input.libraryAssetId ?? input.imageUrl,
    imageUrl: input.imageUrl,
    assetName: input.name,
    libraryAssetId: input.libraryAssetId,
    headAngle: head,
    legPose: leg,
    armPose: arm,
    label: poseVariantLabel(head, leg, arm),
    rig: isCharacterRig(input.rig) ? input.rig : undefined,
  }
}

function variantArm(v: PoseVariant): ArmPoseId {
  return normalizeArmPoseId(v.armPose)
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
  const exact = variants.find(
    (v) =>
      (opts.headAngle == null || v.headAngle === opts.headAngle) &&
      (opts.legPose == null || v.legPose === opts.legPose) &&
      (opts.armPose == null || variantArm(v) === opts.armPose),
  )
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
