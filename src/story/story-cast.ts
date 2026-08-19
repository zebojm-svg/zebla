/** Figur in der aktuellen Szene — displayName ist der Sprechername im Dialog */

export interface SceneCastMember {
  slot: 'left' | 'right'
  imageUrl: string
  /** Name in Bibliothek / bei Generierung */
  assetName: string
  /** Anzeigename in dieser Szene (Sprecher, Aktionen) */
  displayName: string
  libraryAssetId?: string
}

export type SceneCast = {
  left: SceneCastMember | null
  right: SceneCastMember | null
}

export function placeInCast(
  cast: SceneCast,
  slot: 'left' | 'right',
  input: {
    imageUrl: string
    assetName: string
    displayName?: string
    libraryAssetId?: string
  },
): SceneCast {
  return {
    ...cast,
    [slot]: {
      slot,
      imageUrl: input.imageUrl,
      assetName: input.assetName,
      displayName: input.displayName?.trim() || input.assetName,
      libraryAssetId: input.libraryAssetId,
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
