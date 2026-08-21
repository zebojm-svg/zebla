/** Figur in der aktuellen Szene — displayName ist der Sprechername im Dialog */

import type { HeadAngleId, LegPoseId } from '../../shared/character-parts'
import { characterBaseName } from '../../shared/character-parts'

export type CastPose = 'standing' | 'sitting-sofa' | 'custom'

export interface CastTransform {
  offsetX: number
  offsetY: number
  scale: number
  /** Horizontale Streckung (Zerren) */
  scaleX: number
  /** Vertikale Streckung (Zerren) */
  scaleY: number
  rotation: number
}

export const DEFAULT_CAST_TRANSFORM: CastTransform = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
}

export interface SceneCastMember {
  slot: 'left' | 'right'
  imageUrl: string
  assetName: string
  displayName: string
  libraryAssetId?: string
  pose: CastPose
  lookAtPartner: boolean
  transform: CastTransform
  headAngle?: HeadAngleId
  legPose?: LegPoseId
}

export type SceneCast = {
  left: SceneCastMember | null
  right: SceneCastMember | null
}

export interface CastLayerLayout {
  x: number
  y: number
  width: number
  height: number
  flip: boolean
  rotation: number
  zIndex: number
  sourceCrop?: { top?: number; bottom?: number; left?: number; right?: number }
}

export function getCastLayerLayout(
  member: SceneCastMember,
  canvasW: number,
  canvasH: number,
): CastLayerLayout {
  const { slot, pose, lookAtPartner, transform } = member
  const partnerOnRight = slot === 'left'
  const flip = lookAtPartner ? (partnerOnRight ? false : true) : slot === 'right'

  let base: Omit<CastLayerLayout, 'rotation'>

  if (pose === 'sitting-sofa') {
    // Ganzfigur sitzend: Hüfte auf der Sitzkante, Beine hängen nach unten.
    const width = Math.round(canvasW * 0.14)
    const height = Math.round(canvasH * 0.52)
    const seatLineY = Math.round(canvasH * 0.665)
    const hipFromTop = 0.55
    const centerX = slot === 'left' ? 0.235 : 0.365
    base = {
      x: Math.round(centerX * canvasW - width / 2),
      y: Math.round(seatLineY - height * hipFromTop),
      width,
      height,
      flip,
      zIndex: slot === 'left' ? 26 : 27,
    }
  } else {
    const width = Math.round(canvasW * 0.18)
    const height = Math.round(canvasH * 0.62)
    const centerX = slot === 'left' ? 0.28 : 0.72
    const floorY = Math.round(canvasH * 0.94)
    base = {
      x: Math.round(centerX * canvasW - width / 2),
      y: floorY - height,
      width,
      height,
      flip,
      zIndex: slot === 'left' ? 22 : 23,
    }
  }

  const scale = transform.scale || 1
  const scaleX = transform.scaleX || 1
  const scaleY = transform.scaleY || 1
  return {
    ...base,
    x: base.x + transform.offsetX,
    y: base.y + transform.offsetY,
    width: Math.round(base.width * scale * scaleX),
    height: Math.round(base.height * scale * scaleY),
    rotation: transform.rotation,
  }
}

export function placeInCast(
  cast: SceneCast,
  slot: 'left' | 'right',
  input: {
    imageUrl: string
    assetName: string
    displayName?: string
    libraryAssetId?: string
    pose?: CastPose
    lookAtPartner?: boolean
    legPose?: LegPoseId
    headAngle?: HeadAngleId
  },
): SceneCast {
  const partnerPresent = slot === 'left' ? Boolean(cast.right) : Boolean(cast.left)
  const baseName = characterBaseName(input.assetName)
  return {
    ...cast,
    [slot]: {
      slot,
      imageUrl: input.imageUrl,
      assetName: input.assetName,
      displayName: input.displayName?.trim() || baseName,
      libraryAssetId: input.libraryAssetId,
      pose: input.pose ?? 'custom',
      lookAtPartner: input.lookAtPartner ?? partnerPresent,
      transform: { ...DEFAULT_CAST_TRANSFORM },
      legPose: input.legPose,
      headAngle: input.headAngle ?? 'front',
    },
  }
}

export function updateCastHeadAngle(
  cast: SceneCast,
  slot: 'left' | 'right',
  headAngle: HeadAngleId,
): SceneCast {
  const member = cast[slot]
  if (!member) return cast
  return { ...cast, [slot]: { ...member, headAngle } }
}

/** Bild/Pose tauschen, Position und Sprechername behalten */
export function swapCastVariant(
  cast: SceneCast,
  slot: 'left' | 'right',
  input: {
    imageUrl: string
    assetName: string
    libraryAssetId?: string
    headAngle?: HeadAngleId
    legPose?: LegPoseId
  },
): SceneCast {
  const member = cast[slot]
  if (!member) return cast
  return {
    ...cast,
    [slot]: {
      ...member,
      imageUrl: input.imageUrl,
      assetName: input.assetName,
      libraryAssetId: input.libraryAssetId,
      headAngle: input.headAngle ?? member.headAngle,
      legPose: input.legPose ?? member.legPose,
    },
  }
}

export function updateCastName(
  cast: SceneCast,
  slot: 'left' | 'right',
  displayName: string,
): SceneCast {
  const member = cast[slot]
  if (!member) return cast
  return { ...cast, [slot]: { ...member, displayName: displayName.trim() || member.assetName } }
}

export function updateCastPose(cast: SceneCast, slot: 'left' | 'right', pose: CastPose): SceneCast {
  const member = cast[slot]
  if (!member) return cast
  return {
    ...cast,
    [slot]: {
      ...member,
      pose,
      transform: { ...DEFAULT_CAST_TRANSFORM },
    },
  }
}

export function updateCastLookAt(
  cast: SceneCast,
  slot: 'left' | 'right',
  lookAtPartner: boolean,
): SceneCast {
  const member = cast[slot]
  if (!member) return cast
  return { ...cast, [slot]: { ...member, lookAtPartner } }
}

export function updateCastTransform(
  cast: SceneCast,
  slot: 'left' | 'right',
  patch: Partial<CastTransform>,
): SceneCast {
  const member = cast[slot]
  if (!member) return cast
  return {
    ...cast,
    [slot]: {
      ...member,
      pose: 'custom',
      transform: { ...member.transform, ...patch },
    },
  }
}

export function nudgeCastTransform(
  cast: SceneCast,
  slot: 'left' | 'right',
  dx: number,
  dy: number,
): SceneCast {
  const member = cast[slot]
  if (!member) return cast
  return updateCastTransform(cast, slot, {
    offsetX: member.transform.offsetX + dx,
    offsetY: member.transform.offsetY + dy,
  })
}

export function castLayerId(slot: 'left' | 'right'): string {
  return `char-${slot}-generated`
}
