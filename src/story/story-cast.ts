/** Figur in der aktuellen Szene — displayName ist der Sprechername im Dialog */

export type CastPose = 'standing' | 'sitting-sofa'

export interface SceneCastMember {
  slot: 'left' | 'right'
  imageUrl: string
  /** Name in Bibliothek / bei Generierung */
  assetName: string
  /** Anzeigename in dieser Szene (Sprecher, Aktionen) */
  displayName: string
  libraryAssetId?: string
  pose: CastPose
  /** Zur Partnerfigur schauen (horizontal spiegeln) */
  lookAtPartner: boolean
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
  zIndex: number
}

/** Position & Größe der Figur auf der 1280×720-Leinwand */
export function getCastLayerLayout(
  slot: 'left' | 'right',
  pose: CastPose,
  canvasW: number,
  canvasH: number,
  lookAtPartner: boolean,
): CastLayerLayout {
  const partnerOnRight = slot === 'left'
  const flip = lookAtPartner ? (partnerOnRight ? false : true) : slot === 'right'

  if (pose === 'sitting-sofa') {
    const width = Math.round(canvasW * 0.14)
    const height = Math.round(canvasH * 0.42)
    const xPct = slot === 'left' ? 0.34 : 0.52
    const yPct = slot === 'left' ? 0.36 : 0.38
    return {
      x: Math.round(xPct * canvasW - width / 2),
      y: Math.round(yPct * canvasH),
      width,
      height,
      flip,
      zIndex: slot === 'left' ? 24 : 25,
    }
  }

  const width = Math.round(canvasW * 0.17)
  const height = Math.round(canvasH * 0.48)
  const xPct = slot === 'left' ? 0.28 : 0.72
  const yPct = 0.52
  return {
    x: Math.round(xPct * canvasW - width / 2),
    y: Math.round(yPct * canvasH),
    width,
    height,
    flip,
    zIndex: slot === 'left' ? 22 : 23,
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
  },
): SceneCast {
  const partnerPresent = slot === 'left' ? Boolean(cast.right) : Boolean(cast.left)
  return {
    ...cast,
    [slot]: {
      slot,
      imageUrl: input.imageUrl,
      assetName: input.assetName,
      displayName: input.displayName?.trim() || input.assetName,
      libraryAssetId: input.libraryAssetId,
      pose: input.pose ?? 'sitting-sofa',
      lookAtPartner: input.lookAtPartner ?? partnerPresent,
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
  return { ...cast, [slot]: { ...member, pose } }
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
