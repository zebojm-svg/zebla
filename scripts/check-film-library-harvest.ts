/**
 * Standbild → Bibliothek (Figuren einzeln + Hintergrund), ohne echte KI-Bilder.
 * Aufruf: npx tsx scripts/check-film-library-harvest.ts
 */
import {
  characterHarvestTags,
  cutoutRatioLooksIsolated,
  environmentHarvestTags,
  harvestBackgroundLabel,
  harvestFigureLabel,
  harvestFiguresFromPanel,
  harvestNoteDe,
  harvestPlanFromPanel,
  joinDe,
  locationTags,
  namedPersonExtractPrompt,
  namedPersonMaskPrompt,
  rematchFilmBoard,
  sceneHarvestNotesDe,
  shouldSkipBackground,
  shouldSkipCharacterPose,
  STILL_BACKGROUND_EXTRACT_PROMPT,
  HARVEST_FROM_STILL_TAG,
  HARVEST_TAG,
} from '../shared/film-library-harvest.ts'
import {
  binaryAlphaMask,
  maskIoU,
  opaqueBounds,
  opaqueRatio,
} from '../shared/image-person-matte.ts'
import { stillLibraryHintDe, applyPanelHarvestNote } from '../shared/film-stills.ts'
import { matchCharacterPose, matchBackground } from '../shared/film-storyboard.ts'
import type { FilmStoryboard, FilmStoryboardPanel } from '../shared/film-storyboard.ts'
import type { StoryLibraryAsset } from '../shared/story-types.ts'

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

const julienWalk: StoryLibraryAsset = {
  id: 'lib-julien-walk',
  type: 'character',
  name: 'Julien',
  imageUrl: 'https://example.com/julien-gehen.png',
  tags: characterHarvestTags('walking'),
  legPoseId: 'walking',
  headAngleId: 'front',
  armPoseId: 'relaxed',
  createdAt: '2026-01-01',
}

const markt: StoryLibraryAsset = {
  id: 'lib-markt',
  type: 'environment',
  name: 'Weihnachtsmarkt',
  description: 'Stände, Lichter, Schnee',
  imageUrl: 'https://example.com/markt.png',
  tags: environmentHarvestTags('Weihnachtsmarkt Stände'),
  createdAt: '2026-01-01',
}

const maskJulien = namedPersonMaskPrompt('Julien', ['Julien', 'Tara'])
if (!maskJulien.includes('ONLY Julien')) fail('Maske muss nur Julien weiss machen')
if (!maskJulien.toLowerCase().includes('tara')) fail('Maske muss Tara als andere Person kennen')
if (!maskJulien.includes('BLACK')) fail('Andere Leute müssen schwarz sein')
if (!maskJulien.toLowerCase().includes('one white blob')) {
  fail('Maske darf keine Gruppen-Silhouette sein')
}

const extract = namedPersonExtractPrompt('Julien', ['Tara'])
if (!extract.includes('ONLY Julien')) fail('Fallback holt nur Julien')
if (!extract.toLowerCase().includes('tara')) fail('Fallback darf Tara nicht im Ausschnitt lassen')
if (!extract.toLowerCase().includes('rectangle')) fail('Kein Rechteck mit der anderen Person')

if (!STILL_BACKGROUND_EXTRACT_PROMPT.toLowerCase().includes('remove every person')) {
  fail('Hintergrund-Prompt muss alle Leute entfernen')
}

const panel: FilmStoryboardPanel = {
  id: 'p1',
  sceneId: 'scene-1',
  sceneIndex: 0,
  panelIndex: 1,
  sectionId: 'scene-1',
  lineIds: ['l1'],
  caption: 'Julien winkt Tara zu',
  imageCue: 'beide überlappen sich leicht',
  soundCue: '',
  speechCue: '',
  settingHint: 'Weihnachtsmarkt',
  expressionHint: 'freut sich',
  placements: [
    {
      name: 'Julien',
      poseId: 'walking',
      poseHint: 'Gehen',
      depth: 'mid',
      x: 36,
      y: 82,
      scale: 0.8,
      flip: false,
      match: 'missing',
      matchNoteDe: 'Julien (Gehen) fehlt in der Bibliothek — einmal zeichnen, dann wiederverwenden.',
    },
    {
      name: 'Tara',
      poseId: 'waving',
      poseHint: 'Winken',
      depth: 'mid',
      x: 62,
      y: 82,
      scale: 0.8,
      flip: false,
      match: 'missing',
      matchNoteDe: 'Tara fehlt in der Bibliothek — einmal zeichnen, dann wiederverwenden.',
    },
    {
      name: 'Julien',
      poseId: 'walking',
      poseHint: 'Gehen',
      depth: 'mid',
      x: 40,
      y: 82,
      scale: 0.8,
      flip: false,
      match: 'missing',
      matchNoteDe: 'doppelt',
    },
  ],
  background: {
    hint: 'Weihnachtsmarkt',
    match: 'missing',
    matchNoteDe: 'Der Hintergrund fehlt in der Bibliothek',
  },
}

const figures = harvestFiguresFromPanel(panel)
if (figures.length !== 2) fail('Zwei Personen, Julien nur einmal (nicht zwei Posen aus einem Körper)')
if (figures[0]?.name !== 'Julien' || figures[1]?.name !== 'Tara') fail('Julien und Tara in der Ernte')
if (harvestFigureLabel(figures[0]!) !== 'Julien (Gehen)') fail('Beschriftung Julien (Gehen)')

const plan = harvestPlanFromPanel(panel, 'Szene 1')
if (plan.backgroundName !== 'Weihnachtsmarkt') fail('Ort aus dem Panel')
if (harvestBackgroundLabel(plan.backgroundName) !== 'Hintergrund Weihnachtsmarkt') {
  fail('Hintergrund-Beschriftung')
}

if (!characterHarvestTags('walking').includes('walking')) fail('Tag walking für Matcher')
if (!characterHarvestTags('walking').includes('gehen')) fail('Tag gehen für Matcher')
if (!characterHarvestTags('walking').includes(HARVEST_TAG)) fail('Tag harvested')
if (!environmentHarvestTags('Weihnachtsmarkt').includes('weihnachtsmarkt')) {
  fail('Ort als Tag')
}
if (!locationTags('am Weihnachtsmarkt in der Stadt').includes('weihnachtsmarkt')) {
  fail('Ort-Wörter aus dem Hinweis')
}
if (locationTags('am Markt').includes('am')) fail('Füllwörter nicht als Ort speichern')

const emptyLib: StoryLibraryAsset[] = []
if (shouldSkipCharacterPose(emptyLib, 'Julien', 'walking')) fail('Leere Bibliothek: Pose speichern')
if (shouldSkipBackground(emptyLib, 'Weihnachtsmarkt')) fail('Leerer Ort: Hintergrund speichern')

const withWalk = [julienWalk]
if (!shouldSkipCharacterPose(withWalk, 'Julien', 'walking')) {
  fail('Julien (Gehen) schon da → nicht nochmal speichern')
}
if (shouldSkipCharacterPose(withWalk, 'Julien', 'waving')) {
  fail('Winken ist eine andere Pose — speichern')
}
if (shouldSkipCharacterPose(withWalk, 'Tara', 'walking')) {
  fail('Tara ist eine andere Figur')
}

const leftOnly: StoryLibraryAsset[] = [
  {
    ...julienWalk,
    id: 'lib-left',
    tags: ['look-left'],
    headAngleId: 'side-left',
    legPoseId: 'standing',
    armPoseId: 'relaxed',
  },
]
if (shouldSkipCharacterPose(leftOnly, 'Julien', 'look-right')) {
  fail('Nur spiegelbar (transform) zählt nicht als vorhanden — echte Pose speichern')
}

if (!shouldSkipBackground([markt], 'Weihnachtsmarkt Stände')) {
  fail('Gleicher Markt schon da → überspringen')
}

const noteSaved = harvestNoteDe([
  { label: 'Julien (Gehen)', kind: 'character', status: 'saved' },
  { label: 'Hintergrund Weihnachtsmarkt', kind: 'environment', status: 'saved' },
])
if (!noteSaved.includes('Julien (Gehen)')) fail('Hinweis nennt Julien (Gehen)')
if (!noteSaved.includes('Hintergrund Weihnachtsmarkt')) fail('Hinweis nennt den Markt')
if (!noteSaved.includes('liegen jetzt in der Bibliothek')) {
  fail('Hinweis: liegen jetzt in der Bibliothek')
}

const noteFail = harvestNoteDe([
  { label: 'Julien (Gehen)', kind: 'character', status: 'saved' },
  {
    label: 'Tara (Winken)',
    kind: 'character',
    status: 'failed',
    detailDe: 'Tara (Winken) konnte nicht freigestellt werden.',
  },
])
if (!noteFail.includes('liegt jetzt in der Bibliothek')) fail('Eine Figur: liegt')
if (!noteFail.includes('Tara (Winken) konnte nicht freigestellt werden')) {
  fail('Fehler auf Deutsch nennen')
}

if (joinDe(['A', 'B', 'C']) !== 'A, B und C') fail('Aufzählung mit und')

const missingHint = stillLibraryHintDe([panel])
if (!missingHint || !missingHint.toLowerCase().includes('bibliothek')) {
  fail('Gelbe Box solange Pose/Ort fehlen')
}

const board: FilmStoryboard = {
  version: 1,
  source: 'rules',
  scenes: [{ id: 'scene-1', title: 'Szene 1', noteDe: '' }],
  panels: [panel],
  updatedAt: '2026-01-01',
}

const rematched = rematchFilmBoard(board, [julienWalk, markt])
const after = rematched.panels[0]
if (!after) fail('Panel nach dem Abgleich')
if (after.placements[0]?.match !== 'reuse') fail('Julien (Gehen) muss reuse sein')
if (after.background.match !== 'reuse') fail('Markt muss reuse sein')
if (after.placements[1]?.match !== 'missing') fail('Tara fehlt weiterhin')

const stillMissing = stillLibraryHintDe(rematched.panels)
if (!stillMissing || !stillMissing.toLowerCase().includes('tara')) {
  fail('Gelbe Box bleibt für Tara')
}
if (/julien/i.test(stillMissing) && stillMissing.includes('Gehen')) {
  fail('Julien (Gehen) darf nicht mehr als fehlend gelten')
}

const taraWave: StoryLibraryAsset = {
  id: 'lib-tara-wave',
  type: 'character',
  name: 'Tara',
  imageUrl: 'https://example.com/tara-winken.png',
  tags: characterHarvestTags('waving'),
  legPoseId: 'standing',
  headAngleId: 'front',
  armPoseId: 'waving',
  createdAt: '2026-01-01',
}

const full = rematchFilmBoard(board, [julienWalk, taraWave, markt])
if (stillLibraryHintDe(full.panels)) fail('Gelbe Box weg, wenn alles in der Bibliothek liegt')
if (full.panels[0]?.placements[1]?.match !== 'reuse') fail('Tara (Winken) reuse')

if (matchCharacterPose('Julien', 'walking', [julienWalk]).match !== 'reuse') {
  fail('Matcher findet geerntetes Julien (Gehen)')
}
if (matchBackground('Weihnachtsmarkt', [markt]).match !== 'reuse') {
  fail('Matcher findet geernteten Markt')
}

const noted = applyPanelHarvestNote(full, 'p1', noteSaved)
if (noted.panels[0]?.harvestNoteDe !== noteSaved) fail('Hinweis am Bild speichern')
const notes = sceneHarvestNotesDe(noted.panels)
if (notes.length !== 1 || notes[0] !== noteSaved) fail('Szenen-Hinweis aus den Bildern')

function rgba(w: number, h: number): Uint8Array {
  return new Uint8Array(w * h * 4)
}
function setA(buf: Uint8Array, w: number, x: number, y: number, a: number): void {
  buf[(y * w + x) * 4 + 3] = a
}

const W = 40
const H = 20
const left = rgba(W, H)
const right = rgba(W, H)
const blob = rgba(W, H)
for (let y = 2; y <= 17; y++) {
  for (let x = 2; x <= 14; x++) {
    setA(left, W, x, y, 255)
    setA(blob, W, x, y, 255)
  }
  for (let x = 24; x <= 36; x++) setA(right, W, x, y, 255)
  for (let x = 4; x <= 16; x++) setA(blob, W, x, y, 255)
}

const leftMask = binaryAlphaMask(left, W, H)
const rightMask = binaryAlphaMask(right, W, H)
const blobMask = binaryAlphaMask(blob, W, H)
if (maskIoU(leftMask, rightMask) >= 0.2) fail('Getrennte Figuren dürfen sich kaum überlappen')
if (maskIoU(leftMask, blobMask) < 0.55) fail('Gleicher Klumpen muss hohe Überlappung haben')

if (!cutoutRatioLooksIsolated(opaqueRatio(left, W, H))) fail('Linke Figur ist ein gültiger Freisteller')
const fullFrame = rgba(W, H)
for (let i = 0; i < W * H; i++) fullFrame[i * 4 + 3] = 255
if (cutoutRatioLooksIsolated(opaqueRatio(fullFrame, W, H))) {
  fail('Ganzer Rahmen ist kein einzelner Freisteller')
}

const box = opaqueBounds(left, W, H)
if (!box || box.minX > 2 || box.maxX < 14) fail('Zuschnitt um die Figur, nicht um beide')
if (box.maxX >= 24) fail('Zuschnitt darf Tara nicht mitnehmen')

if (!HARVEST_FROM_STILL_TAG) fail('from-still Tag')

console.log('OK: Standbild → Bibliothek, einzelne Figuren, Hintergrund, Wiederverwenden')
