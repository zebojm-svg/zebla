/**
 * Gleiche Person in allen Posen, verschiedene Personen mit gleichem Namen
 * als «Ramo 1» / «Ramo 2». Freisteller aus Gruppenbildern zählen nicht.
 */

import { characterBaseName } from './character-parts.js'
import { STILL_POSES } from './story-stills.js'
import type { StoryLibraryAsset } from './story-types.js'

const FROM_STILL = 'from-still'

export function isCutoutFromStill(asset: Pick<StoryLibraryAsset, 'tags'>): boolean {
  return (asset.tags ?? []).includes(FROM_STILL)
}

/** «Ramo 2 · Sitzen» → Stamm Ramo, Nummer 2. */
export function parseIdentityLabel(name: string): { stem: string; ordinal: number | null } {
  const base = characterBaseName(name)
  const match = base.match(/^(.*?)(?:\s+(\d+))$/)
  if (match?.[1]?.trim() && match[2]) {
    return { stem: match[1].trim(), ordinal: Number(match[2]) }
  }
  return { stem: base, ordinal: null }
}

export function identityStem(name: string): string {
  return parseIdentityLabel(name).stem
}

export function formatIdentityName(stem: string, ordinal: number | null): string {
  if (ordinal == null) return stem
  return `${stem} ${ordinal}`
}

export function libraryPoseKey(asset: Pick<StoryLibraryAsset, 'tags' | 'legPoseId' | 'headAngleId' | 'armPoseId'>): string {
  const tags = (asset.tags ?? []).map((t) => t.toLowerCase())
  for (const pose of STILL_POSES) {
    if (tags.includes(pose.id) || tags.includes(pose.label.toLowerCase())) return pose.id
  }
  if (asset.legPoseId?.startsWith('sitting')) return 'sitting'
  if (asset.legPoseId === 'walking') return 'walking'
  if (asset.armPoseId === 'waving') return 'waving'
  if (asset.headAngleId === 'side-left') return 'look-left'
  if (asset.headAngleId === 'side-right') return 'look-right'
  if (asset.legPoseId === 'standing') return 'standing-front'
  return asset.legPoseId || 'unknown'
}

export type LibraryIdentityGroup = {
  key: string
  displayName: string
  stem: string
  ordinal: number | null
  assets: StoryLibraryAsset[]
}

function stemKey(name: string): string {
  return identityStem(name).toLowerCase()
}

function oldestFirst(a: StoryLibraryAsset, b: StoryLibraryAsset): number {
  return (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id)
}

/**
 * Studio-Figuren nach Person gruppieren.
 * Zwei Sitz-Fotos desselben Namens = zwei Personen (Ramo 1 / Ramo 2).
 * Weitere Posen (Stehen …) gehören zur ältesten Person dieses Namens.
 */
export function partitionLibraryCharacters(characters: StoryLibraryAsset[]): {
  identities: LibraryIdentityGroup[]
  harvested: StoryLibraryAsset[]
} {
  const harvested = characters.filter(isCutoutFromStill)
  const studio = characters.filter((a) => !isCutoutFromStill(a))
  const byStem = new Map<string, StoryLibraryAsset[]>()
  for (const asset of studio) {
    const key = stemKey(asset.name)
    const list = byStem.get(key) ?? []
    list.push(asset)
    byStem.set(key, list)
  }

  const identities: LibraryIdentityGroup[] = []
  for (const group of byStem.values()) {
    group.sort(oldestFirst)
    const stem = identityStem(group[0]!.name)
    const storedNumbered = group.filter((a) => parseIdentityLabel(a.name).ordinal != null)
    if (storedNumbered.length > 0) {
      const byOrd = new Map<number, StoryLibraryAsset[]>()
      const unlabeled: StoryLibraryAsset[] = []
      for (const asset of group) {
        const { ordinal } = parseIdentityLabel(asset.name)
        if (ordinal == null) unlabeled.push(asset)
        else {
          const list = byOrd.get(ordinal) ?? []
          list.push(asset)
          byOrd.set(ordinal, list)
        }
      }
      const ords = [...byOrd.keys()].sort((a, b) => a - b)
      if (unlabeled.length && !byOrd.has(1)) {
        byOrd.set(1, unlabeled)
        ords.unshift(1)
      } else if (unlabeled.length) {
        byOrd.get(ords[0]!)!.push(...unlabeled)
      }
      const many = ords.length > 1
      for (const ordinal of [...new Set(ords)].sort((a, b) => a - b)) {
        const assets = byOrd.get(ordinal) ?? []
        if (!assets.length) continue
        identities.push({
          key: `${stem.toLowerCase()}#${ordinal}`,
          displayName: many ? formatIdentityName(stem, ordinal) : stem,
          stem,
          ordinal,
          assets,
        })
      }
      continue
    }

    const poseBuckets = new Map<string, StoryLibraryAsset[]>()
    for (const asset of group) {
      const key = libraryPoseKey(asset)
      const list = poseBuckets.get(key) ?? []
      list.push(asset)
      poseBuckets.set(key, list)
    }
    const primary: StoryLibraryAsset[] = []
    const extras: StoryLibraryAsset[][] = []
    for (const bucket of poseBuckets.values()) {
      const sorted = [...bucket].sort(oldestFirst)
      primary.push(sorted[0]!)
      for (let i = 1; i < sorted.length; i++) {
        const slot = extras[i - 1] ?? []
        slot.push(sorted[i]!)
        extras[i - 1] = slot
      }
    }
    if (extras.length === 0) {
      identities.push({
        key: stem.toLowerCase(),
        displayName: stem,
        stem,
        ordinal: null,
        assets: primary,
      })
    } else {
      identities.push({
        key: `${stem.toLowerCase()}#1`,
        displayName: formatIdentityName(stem, 1),
        stem,
        ordinal: 1,
        assets: primary,
      })
      extras.forEach((assets, i) => {
        identities.push({
          key: `${stem.toLowerCase()}#${i + 2}`,
          displayName: formatIdentityName(stem, i + 2),
          stem,
          ordinal: i + 2,
          assets,
        })
      })
    }
  }

  identities.sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'))
  return { identities, harvested }
}

/** Figuren der Person, die der Dialogname meint (Ramo → Ramo 1, nicht Ramo 2). */
export function canonicalIdentityAssets(
  library: StoryLibraryAsset[],
  speakerName: string,
): StoryLibraryAsset[] {
  const { identities } = partitionLibraryCharacters(
    library.filter((a) => a.type === 'character'),
  )
  const wanted = parseIdentityLabel(speakerName)
  const stem = wanted.stem.toLowerCase()
  const matches = identities.filter((g) => g.stem.toLowerCase() === stem)
  if (matches.length === 0) return []
  if (wanted.ordinal != null) {
    return (
      matches.find((g) => g.ordinal === wanted.ordinal)?.assets ??
      matches.find((g) => g.ordinal === 1)?.assets ??
      matches[0]!.assets
    )
  }
  return (
    matches.find((g) => g.ordinal == null)?.assets ??
    matches.find((g) => g.ordinal === 1)?.assets ??
    matches[0]!.assets
  )
}

export function identitySaveName(library: StoryLibraryAsset[], speakerName: string): string {
  const assets = canonicalIdentityAssets(library, speakerName)
  if (assets[0]) return characterBaseName(assets[0].name)
  return characterBaseName(speakerName)
}

/** Ältestes Studio-Foto dieser Person — neue Posen davon ableiten, nicht vom Freisteller. */
export function identityReferenceUrl(
  library: StoryLibraryAsset[],
  speakerName: string,
): string | undefined {
  const assets = canonicalIdentityAssets(library, speakerName)
    .filter((a) => a.imageUrl)
    .sort(oldestFirst)
  return assets[0]?.imageUrl
}
