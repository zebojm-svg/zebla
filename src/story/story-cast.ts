/** Figur in der aktuellen Szene — displayName ist der Sprechername im Storyboard */

import type { ArmPoseId, FaceExpressionId, HeadAngleId, LegPoseId } from '../../shared/character-parts'
import {
  characterBaseName,
  normalizeArmPoseId,
  normalizeFaceExpressionId,
  sameLegSilhouette,
} from '../../shared/character-parts'
import {
  clampHeadTwist,
  isCharacterRig,
  type CharacterRig,
} from '../../shared/character-rig'

export type CastPose = 'standing' | 'sitting-sofa' | 'custom'

export const CAST_MAX = 24

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
  id: string
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
  face?: FaceExpressionId
  /** Kopf / Rumpf / Beine — fehlt bei älteren Ganzkörper-Bildern */
  rig?: CharacterRig
  /** Kopf am Hals drehen (Grad), ohne neues Bild */
  headTwist: number
}

export type SceneCast = {
  members: SceneCastMember[]
}

export const EMPTY_CAST: SceneCast = { members: [] }

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

export function newCastMemberId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function getCastMember(cast: SceneCast, id: string | null | undefined): SceneCastMember | null {
  if (!id) return null
  return cast.members.find((m) => m.id === id) ?? null
}

function withMember(
  cast: SceneCast,
  id: string,
  fn: (member: SceneCastMember) => SceneCastMember,
): SceneCast {
  let found = false
  const members = cast.members.map((member) => {
    if (member.id !== id) return member
    found = true
    return fn(member)
  })
  return found ? { members } : cast
}

function spreadCenterX(index: number, count: number, sitting: boolean): number {
  if (sitting) {
    if (count <= 1) return 0.32
    return 0.14 + (index / Math.max(1, count - 1)) * 0.36
  }
  if (count <= 1) return 0.5
  return 0.14 + (index / Math.max(1, count - 1)) * 0.72
}

export function getCastLayerLayout(
  member: SceneCastMember,
  canvasW: number,
  canvasH: number,
  allMembers: SceneCastMember[] = [member],
): CastLayerLayout {
  const { pose, lookAtPartner, transform } = member
  const index = Math.max(0, allMembers.findIndex((m) => m.id === member.id))
  const count = Math.max(1, allMembers.length)
  const sitting = pose === 'sitting-sofa'
  const centerX = spreadCenterX(index, count, sitting)
  const flip = lookAtPartner ? centerX > 0.5 : false

  let base: Omit<CastLayerLayout, 'rotation'>

  if (sitting) {
    const width = Math.round(canvasW * 0.17)
    const seatLineY = Math.round(canvasH * 0.62)
    const hipFromTop = 0.46
    const floorMargin = Math.round(canvasH * 0.03)
    const maxBelowSeat = Math.max(120, canvasH - floorMargin - seatLineY)
    const height = Math.round(
      Math.min(canvasH * 0.68, maxBelowSeat / Math.max(0.2, 1 - hipFromTop)),
    )
    base = {
      x: Math.round(centerX * canvasW - width / 2),
      y: Math.round(seatLineY - height * hipFromTop),
      width,
      height,
      flip,
      zIndex: 24 + index,
    }
  } else {
    const width = Math.round(canvasW * 0.18)
    const height = Math.round(canvasH * 0.62)
    const floorY = Math.round(canvasH * 0.94)
    base = {
      x: Math.round(centerX * canvasW - width / 2),
      y: floorY - height,
      width,
      height,
      flip,
      zIndex: 20 + index,
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

export function addCastMember(
  cast: SceneCast,
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
    face?: FaceExpressionId
    rig?: CharacterRig
  },
): { cast: SceneCast; id: string | null } {
  if (cast.members.length >= CAST_MAX) return { cast, id: null }
  const id = newCastMemberId()
  const partnerPresent = cast.members.length > 0
  const baseName = characterBaseName(input.assetName)
  const member: SceneCastMember = {
    id,
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
    face: normalizeFaceExpressionId(input.face),
    rig: isCharacterRig(input.rig) ? input.rig : undefined,
    headTwist: 0,
  }
  let members = [...cast.members, member]
  if (members.length >= 2) {
    members = members.map((item) => ({ ...item, lookAtPartner: true }))
  }
  return { cast: { members }, id }
}

export function removeCastMember(cast: SceneCast, id: string): SceneCast {
  return { members: cast.members.filter((m) => m.id !== id) }
}

export function updateCastHeadAngle(
  cast: SceneCast,
  id: string,
  headAngle: HeadAngleId,
): SceneCast {
  return withMember(cast, id, (member) => ({ ...member, headAngle }))
}

/** Bild/Pose tauschen, Position und Sprechername behalten */
export function swapCastVariant(
  cast: SceneCast,
  id: string,
  input: {
    imageUrl: string
    assetName: string
    libraryAssetId?: string
    headAngle?: HeadAngleId
    legPose?: LegPoseId
    armPose?: ArmPoseId
    face?: FaceExpressionId
    rig?: CharacterRig
  },
): SceneCast {
  return withMember(cast, id, (member) => ({
    ...member,
    imageUrl: input.imageUrl,
    assetName: input.assetName,
    libraryAssetId: input.libraryAssetId,
    headAngle: input.headAngle ?? member.headAngle,
    legPose: input.legPose ?? member.legPose,
    armPose: input.armPose ?? member.armPose,
    face: input.face ?? member.face,
    rig: isCharacterRig(input.rig) ? input.rig : undefined,
  }))
}

export type MixedCastPart = 'head' | 'torso' | 'legs'

/** Nur den Kopf tauschen, Rumpf und Beine behalten — Gelenk am Hals. */
export function mixCastHead(
  cast: SceneCast,
  id: string,
  headSource: { headAngle?: HeadAngleId; face?: FaceExpressionId; rig?: CharacterRig },
): SceneCast {
  return withMember(cast, id, (member) => {
    if (!member.rig || !headSource.rig) return member
    return {
      ...member,
      headAngle: headSource.headAngle ?? member.headAngle,
      face: headSource.face ?? member.face,
      rig: {
        ...member.rig,
        parts: {
          ...member.rig.parts,
          head: headSource.rig.parts.head,
        },
        joints: member.rig.joints,
        headSourceJoints: headSource.rig.joints,
      },
    }
  })
}

/** Nur die Beine tauschen, Kopf und Rumpf behalten — Hüfte bleibt. */
export function mixCastLegs(
  cast: SceneCast,
  id: string,
  legSource: { legPose?: LegPoseId; rig?: CharacterRig },
): SceneCast {
  return withMember(cast, id, (member) => {
    if (!member.rig || !legSource.rig) return member
    return {
      ...member,
      legPose: legSource.legPose ?? member.legPose,
      rig: {
        ...member.rig,
        parts: {
          ...member.rig.parts,
          legs: legSource.rig.parts.legs,
        },
      },
    }
  })
}

/** Nur den Rumpf (Arme sitzen dort) tauschen, Kopf und Beine behalten. */
export function mixCastTorso(
  cast: SceneCast,
  id: string,
  torsoSource: { armPose?: ArmPoseId; rig?: CharacterRig },
): SceneCast {
  return withMember(cast, id, (member) => {
    if (!member.rig || !torsoSource.rig) return member
    return {
      ...member,
      armPose: torsoSource.armPose ?? member.armPose,
      rig: {
        ...member.rig,
        parts: {
          ...member.rig.parts,
          torso: torsoSource.rig.parts.torso,
        },
      },
    }
  })
}

function mixPart(
  cast: SceneCast,
  id: string,
  part: MixedCastPart,
  source: {
    headAngle?: HeadAngleId
    face?: FaceExpressionId
    legPose?: LegPoseId
    armPose?: ArmPoseId
    rig?: CharacterRig
  },
): SceneCast {
  if (part === 'head') return mixCastHead(cast, id, source)
  if (part === 'legs') return mixCastLegs(cast, id, source)
  return mixCastTorso(cast, id, source)
}

/**
 * Nach einer neuen Zeichnung: immer die Ganzkörper-Variante merken (Aufrufer),
 * hier nur das geänderte Teil auf die aktuelle Figur setzen — sonst ganz tauschen.
 */
export function applyGeneratedPose(
  cast: SceneCast,
  id: string,
  generated: {
    imageUrl: string
    assetName: string
    headAngle: HeadAngleId
    face?: FaceExpressionId
    legPose: LegPoseId
    armPose: ArmPoseId
    rig?: CharacterRig
  },
): { cast: SceneCast; mixed: MixedCastPart | null } {
  const member = getCastMember(cast, id)
  if (!member) return { cast, mixed: null }

  const currentHead = member.headAngle ?? 'front'
  const currentLeg = member.legPose ?? 'standing'
  const currentArm = normalizeArmPoseId(member.armPose)
  const currentFace = normalizeFaceExpressionId(member.face)
  const generatedFace = normalizeFaceExpressionId(generated.face)
  const headPartChanged = generated.headAngle !== currentHead || generatedFace !== currentFace
  const legChanged = generated.legPose !== currentLeg
  const armChanged = generated.armPose !== currentArm
  const changed = [headPartChanged, legChanged, armChanged].filter(Boolean).length
  const canMix = Boolean(member.rig && isCharacterRig(generated.rig))

  let mixed: MixedCastPart | null = null
  if (canMix && changed === 1) {
    if (headPartChanged) mixed = 'head'
    else if (armChanged) mixed = 'torso'
    else if (legChanged && sameLegSilhouette(currentLeg, generated.legPose)) mixed = 'legs'
  }

  if (mixed) return { cast: mixPart(cast, id, mixed, generated), mixed }

  let next = swapCastVariant(cast, id, generated)
  next = updateCastPose(next, id, generated.legPose.startsWith('sitting') ? 'sitting-sofa' : 'standing')
  return { cast: next, mixed: null }
}

export function updateCastHeadTwist(cast: SceneCast, id: string, headTwist: number): SceneCast {
  return withMember(cast, id, (member) => ({ ...member, headTwist: clampHeadTwist(headTwist) }))
}

export function applyCastRig(
  cast: SceneCast,
  id: string,
  rig: CharacterRig,
  imageUrl?: string,
): SceneCast {
  if (!isCharacterRig(rig)) return cast
  return withMember(cast, id, (member) => ({
    ...member,
    rig,
    imageUrl: imageUrl?.trim() || member.imageUrl,
  }))
}

export function updateCastName(cast: SceneCast, id: string, displayName: string): SceneCast {
  return withMember(cast, id, (member) => ({
    ...member,
    displayName: displayName.trim() || member.assetName,
  }))
}

export function updateCastPose(cast: SceneCast, id: string, pose: CastPose): SceneCast {
  return withMember(cast, id, (member) => ({
    ...member,
    pose,
    transform: { ...DEFAULT_CAST_TRANSFORM },
    headTwist: 0,
  }))
}

export function updateCastLookAt(cast: SceneCast, id: string, lookAtPartner: boolean): SceneCast {
  return withMember(cast, id, (member) => ({ ...member, lookAtPartner }))
}

export function updateCastTransform(
  cast: SceneCast,
  id: string,
  patch: Partial<CastTransform>,
): SceneCast {
  return withMember(cast, id, (member) => ({
    ...member,
    pose: 'custom',
    transform: { ...member.transform, ...patch },
  }))
}

export function nudgeCastTransform(cast: SceneCast, id: string, dx: number, dy: number): SceneCast {
  const member = getCastMember(cast, id)
  if (!member) return cast
  return updateCastTransform(cast, id, {
    offsetX: member.transform.offsetX + dx,
    offsetY: member.transform.offsetY + dy,
  })
}

export function castLayerId(id: string): string {
  return `char-${id}`
}

export function castPartLayerId(id: string, part: 'head' | 'torso' | 'legs' | 'full'): string {
  return `char-${id}-${part}`
}

export function memberIdFromLayerId(layerId: string | null): string | null {
  if (!layerId?.startsWith('char-')) return null
  const rest = layerId.slice('char-'.length)
  for (const part of ['head', 'torso', 'legs', 'full'] as const) {
    const suffix = `-${part}`
    if (rest.endsWith(suffix)) return rest.slice(0, -suffix.length) || null
  }
  return rest || null
}
