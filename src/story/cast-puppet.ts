import type { LayerImage } from './CompositeCanvas'
import type { SceneCastMember } from './story-cast'
import { castLayerId, castPartLayerId, getCastLayerLayout } from './story-cast'

export function getCastRenderLayers(
  member: SceneCastMember,
  canvasW: number,
  canvasH: number,
): LayerImage[] {
  const layout = getCastLayerLayout(member, canvasW, canvasH)
  const shared = {
    width: layout.width,
    height: layout.height,
    flip: layout.flip,
    rotation: layout.rotation,
    rotationAnchor: { x: 0.5, y: 1 },
    keyOutWhite: true as const,
    sourceCrop: layout.sourceCrop,
    draggable: true,
  }

  if (!member.rig) {
    return [
      {
        ...shared,
        id: castPartLayerId(member.slot, 'full'),
        src: member.imageUrl,
        x: layout.x,
        y: layout.y,
        zIndex: layout.zIndex,
      },
    ]
  }

  const bodyJoints = member.rig.joints
  const headJoints = member.rig.headSourceJoints ?? bodyJoints
  const dx = (bodyJoints.neck.x - headJoints.neck.x) * layout.width
  const dy = (bodyJoints.neck.y - headJoints.neck.y) * layout.height
  const twist = member.headTwist || 0

  return [
    {
      ...shared,
      id: castPartLayerId(member.slot, 'legs'),
      src: member.rig.parts.legs,
      x: layout.x,
      y: layout.y,
      zIndex: layout.zIndex,
    },
    {
      ...shared,
      id: castPartLayerId(member.slot, 'torso'),
      src: member.rig.parts.torso,
      x: layout.x,
      y: layout.y,
      zIndex: layout.zIndex + 1,
    },
    {
      ...shared,
      id: castPartLayerId(member.slot, 'head'),
      src: member.rig.parts.head,
      x: layout.x + dx,
      y: layout.y + dy,
      zIndex: layout.zIndex + 2,
      localRotation: twist,
      localRotationAnchor: {
        x: layout.flip ? 1 - headJoints.neck.x : headJoints.neck.x,
        y: headJoints.neck.y,
      },
    },
  ]
}

export function bobLayerIds(member: SceneCastMember): string[] {
  if (member.rig) {
    return [
      castPartLayerId(member.slot, 'legs'),
      castPartLayerId(member.slot, 'torso'),
      castPartLayerId(member.slot, 'head'),
    ]
  }
  return [castPartLayerId(member.slot, 'full')]
}

export function selectionLayerId(slot: 'left' | 'right'): string {
  return castLayerId(slot)
}
