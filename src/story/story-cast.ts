/** Figur in der aktuellen Szene — displayName ist der Sprechername im Dialog */

import type { ArmPoseId, HeadAngleId, LegPoseId } from '../../shared/character-parts'
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
  armPose?: ArmPoseId
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
    // Hüfte auf der Sitzkante, ganzer Körper inkl. Füße innerhalb der Leinwand.
    const width = Math.round(canvasW * 0.17)
    const seatLineY = Math.round(canvasH * 0.62)
    const hipFromTop = 0.46
    const floorMargin = Math.round(canvasH * 0.03)
    const maxBelowSeat = Math.max(120, canvasH - floorMargin - seatLineY)
    const height = Math.round(
      Math.min(canvasH * 0.68, maxBelowSeat / Math.max(0.2, 1 - hipFromTop)),
    )
    const centerX = slot === 'left' ? 0.22 : 0.40
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
    armPose?: ArmPoseId
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
      armPose: input.armPose ?? 'relaxed',
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
    armPose?: ArmPoseId
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
      armPose: input.armPose ?? member.armPose,
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

export function slotForIncomingCharacter(
  cast: SceneCast,
  selectedSlot: 'left' | 'right' | null,
  incomingName: string,
): 'left' | 'right' {
  const base = characterBaseName(incomingName).toLowerCase()
  if (selectedSlot) {
    const current = cast[selectedSlot]
    if (current && characterBaseName(current.displayName).toLowerCase() === base) {
      return selectedSlot
    }
    if (!current) return selectedSlot
  }
  if (!cast.left) return 'left'
  if (!cast.right) return 'right'
  return selectedSlot ?? 'left'
}

export function slotFromLayerId(layerId: string | null): 'left' | 'right' | null {
  if (!layerId) return null
  if (layerId.includes('left')) return 'left'
  if (layerId.includes('right')) return 'right'
  return null
}
