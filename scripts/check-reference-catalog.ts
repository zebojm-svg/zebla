/**
 * Katalog: Referenz vor älterem Foto, Raum-Prompt hält den Raum.
 * Aufruf: npx tsx scripts/check-reference-catalog.ts
 */
import {
  characterPlateTags,
  inferPlace,
  isStandingFull,
  orderCharacters,
  orderRooms,
  roomPlateTags,
  splitCatalogArchive,
} from '../shared/catalog-order.ts'
import { identityReferenceUrl } from '../shared/library-identities.ts'
import { matchBackground } from '../shared/film-storyboard.ts'
import { isCatalogReference, roomLikePrompt } from '../shared/reference-catalog.ts'
import type { StoryLibraryAsset } from '../shared/story-types.ts'

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

const oldPose: StoryLibraryAsset = {
  id: 'old',
  type: 'character',
  name: 'Reto',
  imageUrl: 'https://example.com/reto-sit.png',
  tags: ['sitting'],
  createdAt: '2026-01-01T10:00:00.000Z',
}
const plate: StoryLibraryAsset = {
  id: 'plate',
  type: 'character',
  name: 'Reto',
  imageUrl: 'https://example.com/reto-ref.png',
  tags: ['referenz', 'standing-front'],
  createdAt: '2026-11-27T10:00:00.000Z',
}

if (identityReferenceUrl([oldPose], 'Reto') !== oldPose.imageUrl) {
  fail('ohne Referenz bleibt das älteste Foto')
}
if (identityReferenceUrl([oldPose, plate], 'Reto') !== plate.imageUrl) {
  fail('Referenzbild geht vor der alten Pose')
}
const prompted: StoryLibraryAsset = {
  ...plate,
  id: 'prompted',
  prompt: 'Junge, dunkle Haare, blaues Hemd',
  createdAt: '2026-11-27T12:00:00.000Z',
}
if (identityReferenceUrl([plate, prompted], 'Reto') !== prompted.imageUrl) {
  fail('Figur mit gespeichertem Satz geht vor der alten Referenz')
}

const glass: StoryLibraryAsset = {
  id: 'glass',
  type: 'sound',
  name: 'Glas fällt',
  description: 'Ein Glas zerspringt.',
  imageUrl: '',
  tags: ['referenz'],
  createdAt: '2026-11-27T10:00:00.000Z',
}
const split = splitCatalogArchive([oldPose, prompted, glass])
if (split.archive.length !== 1 || split.archive[0]?.id !== 'old') fail('Figur ohne Satz liegt im Archiv')
if (!split.active.some((asset) => asset.id === 'prompted')) fail('neue Figur bleibt im Katalog')
if (!split.active.some((asset) => asset.id === 'glass')) fail('Geräusch bleibt im Katalog')
if (!isCatalogReference(glass)) fail('Geräusch ist eine Referenz')
if (isCatalogReference(oldPose)) fail('Pose ohne Kennzeichen ist keine Referenz')

const prompt = roomLikePrompt({
  name: 'Küche',
  description: 'Gasherd am Fenster',
  stylePrompt: 'illustration',
  change: 'anderes Sofa',
  hasReference: true,
})
if (!prompt.includes('SAME room')) fail('Raum-Prompt hält den Raum')
if (!prompt.includes('anderes Sofa')) fail('Änderung steht im Prompt')
if (!prompt.toLowerCase().includes('no people')) fail('Raum bleibt ohne Leute')

const fresh = roomLikePrompt({
  name: 'Küche',
  description: 'Gasherd',
  stylePrompt: 'illustration',
  hasReference: false,
})
if (!fresh.includes('reference for every later picture')) fail('erster Raum ist die Referenz')

const harvested: StoryLibraryAsset = {
  id: 'harvest',
  type: 'environment',
  name: 'Küche',
  imageUrl: 'https://example.com/kitchen-old.png',
  tags: ['küche'],
  createdAt: '2026-01-01T10:00:00.000Z',
}
const room: StoryLibraryAsset = {
  id: 'room',
  type: 'environment',
  name: 'Küche',
  imageUrl: 'https://example.com/kitchen-ref.png',
  tags: ['referenz', 'küche'],
  createdAt: '2026-11-27T10:00:00.000Z',
}
const matched = matchBackground('Küche mit Gasherd', [harvested, room])
if (matched.libraryAssetId !== room.id) fail('passender Raum nimmt die Referenz')

const sitting: StoryLibraryAsset = {
  ...oldPose,
  id: 'reto-sit',
  name: 'Reto',
  styleId: 'comic',
  legPoseId: 'sitting-forward',
  tags: ['sitting'],
}
const standing: StoryLibraryAsset = {
  ...oldPose,
  id: 'reto-stand',
  name: 'Reto',
  styleId: 'comic',
  legPoseId: 'standing',
  tags: ['standing-front'],
  imageUrl: 'https://example.com/reto-stand.png',
}
if (!isStandingFull(standing)) fail('Stehen zählt als ganzes Bild')
if (isStandingFull(sitting)) fail('Sitzen ist nicht das Stehbild')
const ordered = orderCharacters([sitting, standing])
const reto = ordered[0]?.items[0]
if (!reto || reto.cover.id !== 'reto-stand') fail('Stehende Figur steht vorn')
if (reto.hidden.length !== 1 || reto.needsStanding) fail('andere Ansichten bleiben dahinter')

const kitchen: StoryLibraryAsset = {
  ...oldPose,
  id: 'kitchen',
  type: 'environment',
  name: 'Küche',
  description: 'Gasherd am Fenster',
  styleId: 'comic',
  tags: [],
}
const beach: StoryLibraryAsset = {
  ...kitchen,
  id: 'beach',
  name: 'Strand',
  description: 'Meer und Sand',
}
const rooms = orderRooms([kitchen, beach])
const places = rooms[0]?.items.map((item) => item.placeId).join(',')
if (places !== 'strand,kueche') fail('Orte: Draussen-Reihe vor Küche, Strand vor Küche: ' + places)
if (inferPlace('ein Nachmittag im Wald').id !== 'wald') fail('Wald erkennen')
if (inferPlace('ort:kueche Wohnzimmer').id !== 'kueche') fail('gespeicherter Ort gilt')
if (!roomPlateTags('comic', 'Küche mit Sofa').includes('ort:kueche')) fail('neuer Raum merkt die Küche')
if (!roomPlateTags('comic', 'Küche mit Sofa').includes('sofa')) fail('Sofa wird zum Stichwort')
if (!characterPlateTags('comic', 'Junge mit Brille').includes('brille')) fail('Brille wird zum Stichwort')
if (!characterPlateTags('comic', 'Junge mit Brille').includes('standing-front')) fail('neue Figur ist das Stehbild')

console.log('OK reference-catalog')
