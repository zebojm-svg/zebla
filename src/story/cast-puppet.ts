import type { LayerImage } from './CompositeCanvas'
import type { SceneCastMember } from './story-cast'
import { castLayerId, castPartLayerId, getCastLayerLayout } from './story-cast'

export function getCastRenderLayers(
  member: SceneCastMember,
  canvasW: number,
  canvasH: number,
  allMembers: SceneCastMember[] = [member],
): LayerImage[] {
  const layout = getCastLayerLayout(member, canvasW, canvasH, allMembers)
  const shared = {
    width: layout.width,
    height: layout.height,
    flip: layout.flip,
    rotation: layout.rotation,
    rotationAnchor: { x: 0.5, y: 1 },
    keyOutWhite: false as const,
    sourceCrop: layout.sourceCrop,
    draggable: true,
  }

  if (!member.rig) {
    return [
      {
        ...shared,
        id: castPartLayerId(member.id, 'full'),
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
      id: castPartLayerId(member.id, 'legs'),
      src: member.rig.parts.legs,
      x: layout.x,
      y: layout.y,
      zIndex: layout.zIndex,
    },
    {
      ...shared,
      id: castPartLayerId(member.id, 'torso'),
      src: member.rig.parts.torso,
      x: layout.x,
      y: layout.y,
      zIndex: layout.zIndex + 1,
    },
    {
      ...shared,
      id: castPartLayerId(member.id, 'head'),
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
      castPartLayerId(member.id, 'legs'),
      castPartLayerId(member.id, 'torso'),
      castPartLayerId(member.id, 'head'),
    ]
  }
  return [castPartLayerId(member.id, 'full')]
}

export function selectionLayerId(id: string): string {
  return castLayerId(id)
}
