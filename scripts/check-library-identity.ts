/**
 * Ramo 1 / Ramo 2, Freisteller nicht als Stamm-Figur.
 * Aufruf: npx tsx scripts/check-library-identity.ts
 */
import {
  canonicalIdentityAssets,
  identityReferenceUrl,
  identitySaveName,
  identityStem,
  partitionLibraryCharacters,
  parseIdentityLabel,
} from '../shared/library-identities.ts'
import { characterPieceTags, characterHarvestTags } from '../shared/film-library-harvest.ts'
import { matchCharacterPose } from '../shared/film-storyboard.ts'
import type { StoryLibraryAsset } from '../shared/story-types.ts'

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

if (identityStem('Ramo · Sitzen') !== 'Ramo') fail('Pose-Suffix weg')
if (parseIdentityLabel('Ramo 2').ordinal !== 2) fail('Ramo 2 hat Nummer 2')
if (parseIdentityLabel('Ramo').ordinal != null) fail('Ramo allein ohne Nummer')

const ramoSit: StoryLibraryAsset = {
  id: 'ramo-sit-old',
  type: 'character',
  name: 'Ramo',
  imageUrl: 'https://example.com/ramo-sit.png',
  tags: characterPieceTags('sitting'),
  legPoseId: 'sitting-forward',
  headAngleId: 'front',
  armPoseId: 'relaxed',
  createdAt: '2026-01-01T10:00:00.000Z',
}
const ramoHarvest: StoryLibraryAsset = {
  id: 'ramo-sofa',
  type: 'character',
  name: 'Ramo',
  imageUrl: 'https://example.com/ramo-sofa.png',
  tags: characterHarvestTags('sitting'),
  legPoseId: 'sitting-forward',
  createdAt: '2026-01-01T11:00:00.000Z',
}
const ramoSit2: StoryLibraryAsset = {
  id: 'ramo-sit-new',
  type: 'character',
  name: 'Ramo',
  imageUrl: 'https://example.com/ramo-other.png',
  tags: characterPieceTags('sitting'),
  legPoseId: 'sitting-forward',
  headAngleId: 'front',
  armPoseId: 'relaxed',
  createdAt: '2026-01-01T12:00:00.000Z',
}

const split = partitionLibraryCharacters([ramoSit, ramoHarvest, ramoSit2])
if (split.harvested.length !== 1 || split.harvested[0]?.id !== 'ramo-sofa') {
  fail('Sofa-Freisteller gehört nicht zu den Studio-Posen')
}
if (split.identities.length !== 2) fail('zwei sitzende Studio-Ramos → Ramo 1 und Ramo 2')
if (split.identities[0]?.displayName !== 'Ramo 1') fail('ältester ist Ramo 1')
if (split.identities[1]?.displayName !== 'Ramo 2') fail('zweiter Sitzender ist Ramo 2')
if (split.identities[0]?.assets.some((a) => a.id === 'ramo-sit-new')) {
  fail('Ramo 1 darf den zweiten Sitzenden nicht enthalten')
}

const canon = canonicalIdentityAssets([ramoSit, ramoHarvest, ramoSit2], 'Ramo')
if (canon.length !== 1 || canon[0]?.id !== 'ramo-sit-old') {
  fail('Dialog-Ramo nimmt Ramo 1 (ältestes Studio), nicht den Sofa-Schnitt')
}
if (identityReferenceUrl([ramoSit, ramoHarvest, ramoSit2], 'Ramo') !== ramoSit.imageUrl) {
  fail('Stehen wird vom sitzenden Stamm-Foto erzeugt')
}
if (identitySaveName([ramoSit, ramoHarvest, ramoSit2], 'Ramo') !== 'Ramo') {
  fail('neue Pose bleibt Ramo (nicht der Freisteller-Name)')
}

if (matchCharacterPose('Ramo', 'sitting', [ramoSit, ramoHarvest, ramoSit2]).libraryAssetId !== 'ramo-sit-old') {
  fail('Sitzen wiederverwenden: Ramo 1, nicht der andere Sitzende')
}
if (matchCharacterPose('Ramo', 'sitting', [ramoHarvest]).match === 'reuse') {
  fail('nur Sofa-Schnitt → nicht als Stamm nehmen, neu zeichnen')
}
if (matchCharacterPose('Ramo', 'standing-front', [ramoSit]).match !== 'missing') {
  fail('Stehen fehlt — vom Sitz-Foto neu zeichnen')
}

const numbered: StoryLibraryAsset[] = [
  { ...ramoSit, name: 'Ramo 1' },
  { ...ramoSit2, name: 'Ramo 2' },
]
const fromTwo = canonicalIdentityAssets(numbered, 'Ramo 2')
if (fromTwo[0]?.id !== 'ramo-sit-new') fail('Ramo 2 gezielt wählen')

console.log('OK: Identitäten Ramo 1/2, Freisteller getrennt, Stamm-Foto für neue Posen')
