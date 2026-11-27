/**
 * Katalog: Figuren nach Stil, eine stehende Figur vorn.
 * Räume nach Stil, dann nach Ort. Stichwörter kommen aus dem Text, ohne extra KI.
 */

import { isStoryArtStyleId, STORY_ART_STYLES, getStoryArtStyle } from './story-art-styles.js'
import {
  identityStem,
  isCutoutFromStill,
  libraryPoseKey,
  partitionLibraryCharacters,
} from './library-identities.js'
import { REFERENCE_TAG } from './reference-catalog.js'
import type { StoryLibraryAsset } from './story-types.js'

export type PlaceId =
  | 'draussen'
  | 'drinnen'
  | 'wald'
  | 'strand'
  | 'see'
  | 'pool'
  | 'kueche'
  | 'wohnzimmer'
  | 'schlafzimmer'
  | 'bad'
  | 'schule'
  | 'park'
  | 'markt'
  | 'ohne-ort'

type PlaceRule = { id: PlaceId; label: string; re: RegExp; generic?: boolean }

const PLACES: PlaceRule[] = [
  { id: 'kueche', label: 'Küche', re: /küche|kueche|kitchen/i },
  { id: 'wohnzimmer', label: 'Wohnzimmer', re: /wohnzimmer|stube|living[\s-]?room/i },
  { id: 'schlafzimmer', label: 'Schlafzimmer', re: /schlafzimmer|bedroom/i },
  { id: 'bad', label: 'Bad', re: /\bbad\b|badezimmer|bathroom/i },
  { id: 'schule', label: 'Schule', re: /schule|klassenzimmer|\bschool\b/i },
  { id: 'wald', label: 'Wald', re: /\bwald\b|forest/i },
  { id: 'strand', label: 'Strand', re: /strand|beach/i },
  { id: 'see', label: 'See', re: /\bsee\b|seeufer|\blake\b/i },
  { id: 'pool', label: 'Pool', re: /\bpool\b|schwimmbad/i },
  { id: 'park', label: 'Park', re: /\bpark\b/i },
  { id: 'markt', label: 'Markt', re: /\bmarkt\b|basar|bazaar/i },
  { id: 'draussen', label: 'Draussen', re: /draussen|draußen|outdoor|gasse|stra(?:ss|ß)e|garten/i, generic: true },
  { id: 'drinnen', label: 'Drinnen', re: /drinnen|indoor|\bzimmer\b/i, generic: true },
]

const PLACE_SORT: PlaceId[] = [
  'draussen',
  'drinnen',
  'wald',
  'strand',
  'see',
  'pool',
  'kueche',
  'wohnzimmer',
  'schlafzimmer',
  'bad',
  'schule',
  'park',
  'markt',
  'ohne-ort',
]

const DETAIL_RULES: Array<{ tag: string; re: RegExp }> = [
  { tag: 'brille', re: /brill/i },
  { tag: 'frisur', re: /frisur|\bhaare\b|\bhaar\b/i },
  { tag: 'schmuck', re: /schmuck|kette|ohrring|armband|ring\b/i },
  { tag: 'hut', re: /\bhut\b|mütze|muetze|cap\b/i },
  { tag: 'sofa', re: /sofa|couch/i },
  { tag: 'sessel', re: /sessel/i },
  { tag: 'tisch', re: /tisch/i },
  { tag: 'stuhl', re: /stuhl|stühle|stuehle/i },
  { tag: 'herd', re: /\bherd\b/i },
  { tag: 'lampe', re: /lampe/i },
  { tag: 'teppich', re: /teppich/i },
]

export function isStandingFull(asset: Pick<StoryLibraryAsset, 'type' | 'imageUrl' | 'tags' | 'legPoseId' | 'headAngleId' | 'armPoseId'>): boolean {
  if (asset.type !== 'character' || !asset.imageUrl) return false
  if (isCutoutFromStill(asset)) return false
  return libraryPoseKey(asset) === 'standing-front'
}

export function detailTags(text: string): string[] {
  return DETAIL_RULES.filter((rule) => rule.re.test(text)).map((rule) => rule.tag)
}

export function inferPlace(text: string): { id: PlaceId; label: string } {
  const tagged = text.match(/ort:([a-z-]+)/i)?.[1] as PlaceId | undefined
  const known = PLACES.find((place) => place.id === tagged)
  if (known) return { id: known.id, label: known.label }
  const specific = PLACES.find((place) => !place.generic && place.re.test(text))
  if (specific) return { id: specific.id, label: specific.label }
  const generic = PLACES.find((place) => place.generic && place.re.test(text))
  if (generic) return { id: generic.id, label: generic.label }
  return { id: 'ohne-ort', label: 'Ohne Ort' }
}

export function styleKeyOf(asset: Pick<StoryLibraryAsset, 'styleId'>): string {
  return asset.styleId && isStoryArtStyleId(asset.styleId) ? asset.styleId : 'ohne-stil'
}

export function styleLabelOf(styleId: string): string {
  if (styleId === 'ohne-stil') return 'Ohne Stil'
  return getStoryArtStyle(styleId).label
}

export function characterPlateTags(styleId: string | undefined, description: string): string[] {
  const tags = [REFERENCE_TAG, 'standing-front', ...detailTags(description)]
  if (styleId && isStoryArtStyleId(styleId)) tags.push(`stil:${styleId}`)
  return tags
}

export function roomPlateTags(styleId: string | undefined, description: string): string[] {
  const place = inferPlace(description)
  const tags = [REFERENCE_TAG, ...detailTags(description)]
  if (place.id !== 'ohne-ort') tags.push(`ort:${place.id}`)
  if (styleId && isStoryArtStyleId(styleId)) tags.push(`stil:${styleId}`)
  return tags
}

export type CharacterStack = {
  key: string
  styleId: string
  styleLabel: string
  displayName: string
  cover: StoryLibraryAsset
  hidden: StoryLibraryAsset[]
  needsStanding: boolean
}

export type StyleGroup<T> = {
  styleId: string
  styleLabel: string
  items: T[]
}

function styleRank(styleId: string): number {
  if (styleId === 'ohne-stil') return 99
  const index = STORY_ART_STYLES.findIndex((style) => style.id === styleId)
  return index === -1 ? 50 : index
}

function placeRank(placeId: PlaceId): number {
  const index = PLACE_SORT.indexOf(placeId)
  return index === -1 ? 80 : index
}

function pickCover(assets: StoryLibraryAsset[]): StoryLibraryAsset | undefined {
  const standing = assets
    .filter(isStandingFull)
    .sort((a, b) => {
      const aRef = (a.tags ?? []).includes(REFERENCE_TAG) ? 1 : 0
      const bRef = (b.tags ?? []).includes(REFERENCE_TAG) ? 1 : 0
      if (aRef !== bRef) return bRef - aRef
      return (b.createdAt || '').localeCompare(a.createdAt || '')
    })
  if (standing[0]) return standing[0]
  return (
    assets.find((asset) => asset.imageUrl && !isCutoutFromStill(asset)) ??
    assets.find((asset) => asset.imageUrl) ??
    assets[0]
  )
}

export function orderCharacters(assets: StoryLibraryAsset[]): StyleGroup<CharacterStack>[] {
  const people = assets.filter((asset) => asset.type === 'character')
  const { identities, harvested } = partitionLibraryCharacters(people)
  const buckets = new Map<string, { styleId: string; displayName: string; assets: StoryLibraryAsset[] }>()

  const put = (styleId: string, displayName: string, identityKey: string, asset: StoryLibraryAsset) => {
    const key = `${styleId}::${identityKey}`
    const bucket = buckets.get(key) ?? { styleId, displayName, assets: [] }
    bucket.assets.push(asset)
    buckets.set(key, bucket)
  }

  for (const identity of identities) {
    for (const asset of identity.assets) {
      put(styleKeyOf(asset), identity.displayName, identity.key, asset)
    }
  }

  for (const cut of harvested) {
    const stem = identityStem(cut.name).toLowerCase()
    const styleId = styleKeyOf(cut)
    const sameStyle = [...buckets.entries()].find(
      ([key, bucket]) => key.startsWith(`${styleId}::`) && identityStem(bucket.displayName).toLowerCase() === stem,
    )
    const anyStyle = [...buckets.entries()].find(
      ([, bucket]) => identityStem(bucket.displayName).toLowerCase() === stem,
    )
    const hit = sameStyle ?? anyStyle
    if (hit) hit[1].assets.push(cut)
    else put(styleId, identityStem(cut.name) || cut.name, `cut-${cut.id}`, cut)
  }

  const stacks: CharacterStack[] = []
  for (const [key, bucket] of buckets) {
    const cover = pickCover(bucket.assets)
    if (!cover) continue
    stacks.push({
      key,
      styleId: bucket.styleId,
      styleLabel: styleLabelOf(bucket.styleId),
      displayName: bucket.displayName,
      cover,
      hidden: bucket.assets.filter((asset) => asset.id !== cover.id),
      needsStanding: !bucket.assets.some(isStandingFull),
    })
  }

  const byStyle = new Map<string, CharacterStack[]>()
  for (const stack of stacks) {
    const list = byStyle.get(stack.styleId) ?? []
    list.push(stack)
    byStyle.set(stack.styleId, list)
  }
  return [...byStyle.entries()]
    .sort((a, b) => styleRank(a[0]) - styleRank(b[0]))
    .map(([styleId, items]) => ({
      styleId,
      styleLabel: styleLabelOf(styleId),
      items: items.sort((a, b) => a.displayName.localeCompare(b.displayName, 'de')),
    }))
}

export type RoomGroup = {
  placeId: PlaceId
  placeLabel: string
  rooms: StoryLibraryAsset[]
}

export function orderRooms(assets: StoryLibraryAsset[]): StyleGroup<RoomGroup>[] {
  const rooms = assets.filter((asset) => asset.type === 'environment')
  const tree = new Map<string, Map<PlaceId, StoryLibraryAsset[]>>()
  for (const room of rooms) {
    const styleId = styleKeyOf(room)
    const text = [room.name, room.description ?? '', ...(room.tags ?? [])].join(' ')
    const place = inferPlace(text)
    const styles = tree.get(styleId) ?? new Map<PlaceId, StoryLibraryAsset[]>()
    const list = styles.get(place.id) ?? []
    list.push(room)
    styles.set(place.id, list)
    tree.set(styleId, styles)
  }
  return [...tree.entries()]
    .sort((a, b) => styleRank(a[0]) - styleRank(b[0]))
    .map(([styleId, places]) => ({
      styleId,
      styleLabel: styleLabelOf(styleId),
      items: [...places.entries()]
        .sort((a, b) => placeRank(a[0]) - placeRank(b[0]))
        .map(([placeId, list]) => ({
          placeId,
          placeLabel: placeId === 'ohne-ort' ? 'Ohne Ort' : inferPlace(`ort:${placeId}`).label,
          rooms: list.sort((a, b) => a.name.localeCompare(b.name, 'de')),
        })),
    }))
}

export function catalogHay(asset: StoryLibraryAsset): string {
  const text = [asset.name, asset.description ?? '', ...(asset.tags ?? [])].join(' ')
  const place = asset.type === 'environment' ? inferPlace(text).label : ''
  return `${text} ${detailTags(text).join(' ')} ${place} ${styleLabelOf(styleKeyOf(asset))}`.toLowerCase()
}
