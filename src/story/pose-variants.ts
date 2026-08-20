import {
  characterBaseName,
  isHeadAngleId,
  isLegPoseId,
  poseVariantLabel,
  type HeadAngleId,
  type LegPoseId,
} from '../../shared/character-parts'
import type { StoryLibraryAsset } from '../../shared/story-types'

export type PoseVariantSource = {
  imageUrl: string
  name: string
  libraryAssetId?: string
  headAngle?: HeadAngleId
  legPose?: LegPoseId
}

export type PoseVariant = {
  key: string
  imageUrl: string
  assetName: string
  libraryAssetId?: string
  headAngle?: HeadAngleId
  legPose?: LegPoseId
  label: string
}

function normalizeVariant(input: PoseVariantSource): PoseVariant | null {
  const head =
    input.headAngle && isHeadAngleId(input.headAngle) ? input.headAngle : undefined
  const leg = input.legPose && isLegPoseId(input.legPose) ? input.legPose : undefined
  if (!head && !leg && !input.imageUrl) return null
  return {
    key: input.libraryAssetId ?? input.imageUrl,
    imageUrl: input.imageUrl,
    assetName: input.name,
    libraryAssetId: input.libraryAssetId,
    headAngle: head,
    legPose: leg,
    label: poseVariantLabel(head, leg),
  }
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
    })
    if (v) byKey.set(v.key, v)
  }

  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'de'))
}

export function findPoseVariant(
  variants: PoseVariant[],
  opts: { headAngle?: HeadAngleId; legPose?: LegPoseId },
): PoseVariant | undefined {
  const exact = variants.find(
    (v) =>
      (opts.headAngle == null || v.headAngle === opts.headAngle) &&
      (opts.legPose == null || v.legPose === opts.legPose),
  )
  if (exact) return exact
  if (opts.headAngle != null) {
    const byHead = variants.find((v) => v.headAngle === opts.headAngle)
    if (byHead) return byHead
  }
  if (opts.legPose != null) {
    return variants.find((v) => v.legPose === opts.legPose)
  }
  return undefined
}

export function availableHeadAngles(variants: PoseVariant[], legPose?: LegPoseId): HeadAngleId[] {
  const ids = new Set<HeadAngleId>()
  for (const v of variants) {
    if (!v.headAngle) continue
    if (legPose && v.legPose && v.legPose !== legPose) continue
    ids.add(v.headAngle)
  }
  return [...ids]
}

export function availableLegPoses(variants: PoseVariant[]): LegPoseId[] {
  const ids = new Set<LegPoseId>()
  for (const v of variants) {
    if (v.legPose) ids.add(v.legPose)
  }
  return [...ids]
}
