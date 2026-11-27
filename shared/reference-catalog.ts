/** Katalog: Referenzbilder und Geräusche. Eine neue Sicht wird neu gezeichnet. */

export const REFERENCE_TAG = 'referenz'

export const CHARACTER_REFERENCE_LINE =
  'Identity reference plate: one person only, full body, front view, plain quiet background. Later pictures must keep this face, hair and clothes.'

export type CatalogKind = 'character' | 'environment' | 'sound'

export function isCatalogReference(asset: { type?: string; tags?: string[] }): boolean {
  if (asset.type === 'sound') return true
  return (asset.tags ?? []).includes(REFERENCE_TAG)
}

export function roomLikePrompt(opts: {
  name: string
  description: string
  stylePrompt: string
  change?: string
  hasReference: boolean
}): string {
  const change = opts.change?.trim()
  const lines = [
    opts.stylePrompt,
    opts.hasReference
      ? 'The attached photo is the ROOM REFERENCE. Draw this SAME room again so a viewer recognizes it: same windows, walls, floor, doors and fixed appliances. A new camera angle is allowed. Do not invent a different home.'
      : 'Draw one clear empty room. This picture is the reference for every later picture of this place.',
    `Room name: ${opts.name}.`,
    `What belongs in this room: ${opts.description.trim()}`,
  ]
  if (change) {
    lines.push(`Change ONLY this, keep the room recognizable: ${change}`)
  } else if (opts.hasReference) {
    lines.push('Keep the furniture the same as in the reference photo.')
  }
  lines.push('NO people, NO faces, NO characters, NO silhouettes, NO text, NO labels.')
  return lines.join('\n')
}
