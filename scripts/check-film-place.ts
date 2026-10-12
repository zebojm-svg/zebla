/**
 * Ort, Grundbild und Vorlagen für die Bild-KI.
 * Aufruf: npx tsx scripts/check-film-place.ts
 */
import {
  inferFilmPlaceKey,
  inferSettingHintDe,
  placeLockEn,
} from '../shared/film-place.ts'
import {
  panelPlaceKey,
  placeGrundbildPanel,
  previousPlaceStillUrl,
  stillReferencePack,
} from '../shared/film-stills.ts'
import {
  panelWantsOwnStill,
  planBoardWithoutAi,
} from '../shared/film-storyboard.ts'
import type { Dialog } from '../shared/types.ts'
import type { FilmStoryboard } from '../shared/film-storyboard.ts'

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

if (inferFilmPlaceKey('Ramo bereitet Tee vor für seine Gäste') !== 'kitchen') {
  fail('Tee vorbereiten ist die Küche')
}
if (inferFilmPlaceKey('Salam, Khan.') !== 'living') fail('Salam ist das Wohnzimmer')
if (inferFilmPlaceKey('Da klopft es an der Tür') !== 'door') fail('Klopfen ist die Tür')
if (!inferSettingHintDe('Ramo füllt Wasser in den Teekessel').startsWith('Küche')) {
  fail('Küchen-Ort muss mit Küche beginnen')
}
if (!inferSettingHintDe('Salam.').startsWith('Wohnzimmer')) {
  fail('Wohnzimmer-Ort muss mit Wohnzimmer beginnen')
}
if (!placeLockEn('kitchen').toLowerCase().includes('cushions')) {
  fail('Küchen-Lock verbietet Sitzkissen')
}
if (!placeLockEn('kitchen').toLowerCase().includes('kettle')) {
  fail('Küchen-Lock hält die Kanne')
}
if (!placeLockEn('kitchen').toLowerCase().includes('induction')) {
  fail('Küchen-Lock hält Gas- oder Induktionsherd')
}
if (!placeLockEn('kitchen').toLowerCase().includes('before')) {
  fail('Küchen-Lock: Wasser vor dem Herd')
}
const doorLock = placeLockEn('door').toLowerCase()
if (!doorLock.includes('1.0') && !doorLock.includes('1.2') && !doorLock.includes('door height')) {
  fail('Tür-Lock: Schloss auf Türhöhe, nicht auf dem Boden')
}
if (!doorLock.includes('feet') || !doorLock.includes('floor')) {
  fail('Tür-Lock verbietet Schloss auf dem Boden und nur Füsse')
}

const filmPrompt =
  'Ramo macht Tee in der Küche, dann sitzen die Gäste im Wohnzimmer auf dem Boden.'
const dialog: Dialog = {
  id: 'd-place',
  userId: 'u1',
  title: 'Tee',
  sourceLanguage: 'de',
  targetLanguage: 'fa',
  length: 'short',
  filmPrompt,
  sections: [
    {
      id: 's1',
      title: 'Besuch',
      lines: [
        {
          id: 'a',
          speaker: 'Handlung',
          kind: 'action',
          text: 'Ramo bereitet Tee vor für seine Gäste.',
        },
        { id: 'b', speaker: 'Ramo', text: 'Salam.' },
        { id: 'c', speaker: 'Khan', text: 'Salam.' },
        { id: 'd', speaker: 'Schöme', text: 'Salam.' },
      ],
    },
  ],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}
const board = planBoardWithoutAi(dialog, [])
if (!board.panels[0]?.settingHint?.startsWith('Küche')) fail('Erstes Bild: Küche als Ort')
if (panelPlaceKey(board.panels[0]!) !== 'kitchen') fail('Erstes Bild: Küche')
if (panelPlaceKey(board.panels[1]!) !== 'living') fail('Ramo Salam: Wohnzimmer')
if (board.panels[2]?.shot !== 'closeup' || board.panels[2]?.closeupSpeaker !== 'Khan') {
  fail('Khan bekommt eine eigene Nahaufnahme')
}
if (board.panels[3]?.shot !== 'closeup' || board.panels[3]?.closeupSpeaker !== 'Schöme') {
  fail('Schöme bekommt eine eigene Nahaufnahme, nicht das Khan-Bild')
}
if (!panelWantsOwnStill(board.panels[2]!, board.panels)) fail('Khan-Bild nicht vom vorigen kopieren')
if (!panelWantsOwnStill(board.panels[3]!, board.panels)) fail('Schöme-Bild nicht vom Khan-Bild kopieren')
if (board.panels[1]?.settingHint === filmPrompt) {
  fail('Ort ist nicht der ganze Film-Prompt')
}

const kitchenInsert = {
  ...board.panels[0]!,
  id: 'k1',
  shot: 'insert' as const,
  stillUrl: 'https://example.com/kitchen.png',
  settingHint: inferSettingHintDe('Ramo bereitet Tee vor'),
  placements: [
    {
      ...board.panels[0]!.placements[0]!,
      name: 'Ramo',
      imageUrl: 'https://example.com/ramo.png',
    },
  ],
  background: {
    hint: 'Küche',
    imageUrl: 'https://example.com/kitchen-empty.png',
    match: 'reuse' as const,
  },
}
const livingWide = {
  ...board.panels[1]!,
  id: 'w1',
  shot: 'wide' as const,
  stillUrl: 'https://example.com/living.png',
  settingHint: inferSettingHintDe('Salam.'),
}
const mixedBoard: FilmStoryboard = {
  ...board,
  panels: [kitchenInsert, livingWide],
}
if (placeGrundbildPanel(mixedBoard, kitchenInsert)?.stillUrl === 'https://example.com/living.png') {
  fail('Küchenbild darf nicht das Wohnzimmer-Grundbild nehmen')
}
if (placeGrundbildPanel(mixedBoard, livingWide)?.stillUrl === 'https://example.com/kitchen.png') {
  fail('Wohnzimmer darf nicht das Küchen-Insert als Grundbild nehmen')
}

const packKitchen = stillReferencePack(kitchenInsert, {
  sceneWideStillUrl: 'https://example.com/living.png',
  board: mixedBoard,
})
if (packKitchen.urls.includes('https://example.com/living.png')) {
  fail('Küchen-Zwischenbild bekommt nicht das Wohnzimmer mitgeschickt')
}
if (!packKitchen.urls.includes('https://example.com/ramo.png')) {
  fail('Küchen-Zwischenbild bekommt Ramo als Stammbild')
}
if (!packKitchen.noteDe.includes('Ramo')) fail('Notiz sagt, wer mitgeschickt wurde')
if (!packKitchen.instruction.toLowerCase().includes('kitchen')) {
  fail('Anweisung an die Bild-KI nennt die Küche')
}

const kitchenFill = {
  ...kitchenInsert,
  id: 'k-fill',
  stillUrl: 'https://example.com/kettle-fill.png',
  caption: 'Ramo füllt Wasser in den Kessel',
  imageCue: 'Kessel an der Spüle',
}
const kitchenStove = {
  ...kitchenInsert,
  id: 'k-stove',
  stillUrl: undefined,
  caption: 'Ramo stellt den Kessel auf den Herd',
  imageCue: 'Kessel auf den Herd',
}
const kitchenSeq: FilmStoryboard = {
  ...board,
  panels: [kitchenFill, kitchenStove, livingWide],
}
if (previousPlaceStillUrl(kitchenSeq, kitchenStove) !== 'https://example.com/kettle-fill.png') {
  fail('Herd-Bild nimmt die vorige Küche, nicht das Wohnzimmer')
}
if (previousPlaceStillUrl(kitchenSeq, kitchenFill)) {
  fail('Erstes Küchenbild hat noch keine vorige Kanne')
}
const packStove = stillReferencePack(kitchenStove, { board: kitchenSeq })
if (!packStove.urls.includes('https://example.com/kettle-fill.png')) {
  fail('Herd-Bild bekommt die vorige Kanne mitgeschickt')
}
if (packStove.urls.includes('https://example.com/kitchen-empty.png')) {
  fail('Leere Bibliotheks-Küche nicht statt der vorigen Kanne')
}
if (packStove.urls.includes('https://example.com/living.png')) {
  fail('Herd-Bild bekommt nicht das Wohnzimmer mitgeschickt')
}
if (!packStove.instruction.toLowerCase().includes('kettle')) {
  fail('Anweisung hält die Kanne fest')
}
if (!packStove.instruction.toLowerCase().includes('induction')) {
  fail('Anweisung hält den Herd fest')
}

console.log('OK: Ort, Grundbild und Vorlagen für die Bild-KI')
