/** Bilder aus dem Katalog, die die Regie für diese Geschichte nehmen soll. */

export interface CatalogCast {
  personIds: string[]
  placeIds: string[]
}

export function emptyCatalogCast(): CatalogCast {
  return { personIds: [], placeIds: [] }
}

function namesMatch(assetName: string, want: string): boolean {
  const left = assetName.trim().toLowerCase()
  const right = want.trim().toLowerCase()
  if (!left || !right) return false
  if (left === right) return true
  if (left.length >= 3 && right.includes(left)) return true
  if (right.length >= 3 && left.includes(right)) return true
  return false
}

export function pickedCastUrl(
  library: Array<{ id: string; name?: string; imageUrl?: string }>,
  ids: string[] | undefined,
  name: string,
): string | undefined {
  if (!ids?.length) return undefined
  for (const id of ids) {
    const asset = library.find((item) => item.id === id)
    if (!asset?.imageUrl?.startsWith('http')) continue
    if (namesMatch(asset.name || '', name)) return asset.imageUrl
  }
  return undefined
}
