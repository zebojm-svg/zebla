/**
 * Dialog → Storyboard, Bibliothek zuerst (ohne echte KI-Bilder).
 * Aufruf: npx tsx scripts/check-film-storyboard.ts
 */
import {
  applyDirectorNote,
  inferExpression,
  inferPoseId,
  insertPanelAfter,
  matchBackground,
  matchCharacterPose,
  planBoardWithoutAi,
} from '../shared/film-storyboard.ts'
import type { Dialog } from '../shared/types.ts'
import type { StoryLibraryAsset } from '../shared/story-types.ts'

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

if (inferPoseId('Julien sitzt auf der Bank') !== 'sitting') fail('sitzt → sitting')
if (inferPoseId('Julien winkt') !== 'waving') fail('winkt → waving')
if (inferPoseId('schaut nach links') !== 'look-left') fail('links → look-left')

const julienSit: StoryLibraryAsset = {
  id: 'lib-sit',
  type: 'character',
  name: 'Julien',
  imageUrl: 'https://example.com/julien-sit.png',
  tags: ['sitting'],
  legPoseId: 'sitting-forward',
  headAngleId: 'front',
  armPoseId: 'relaxed',
  createdAt: '2026-01-01',
}

const park: StoryLibraryAsset = {
  id: 'lib-park',
  type: 'environment',
  name: 'Park im Herbst',
  description: 'Bäume, Bank, Laub',
  imageUrl: 'https://example.com/park.png',
  tags: ['park', 'herbst'],
  createdAt: '2026-01-01',
}

const sitMatch = matchCharacterPose('Julien', 'sitting', [julienSit])
if (sitMatch.match !== 'reuse') fail('Julien sitzend muss reuse sein')

const waveMatch = matchCharacterPose('Julien', 'waving', [julienSit])
if (waveMatch.match !== 'missing') fail('Winken fehlt, obwohl Julien da ist')

const leftAsset: StoryLibraryAsset = {
  ...julienSit,
  id: 'lib-left',
  tags: ['look-left'],
  headAngleId: 'side-left',
  legPoseId: 'standing',
}
const flipMatch = matchCharacterPose('Julien', 'look-right', [leftAsset])
if (flipMatch.match !== 'transform' || !flipMatch.flip) fail('links → rechts soll spiegeln')

const bg = matchBackground('Park Bank Herbst', [park])
if (bg.match !== 'reuse') fail('Park muss gefunden werden')

const dialog: Dialog = {
  id: 'd1',
  userId: 'u1',
  title: 'Im Park',
  sourceLanguage: 'de',
  targetLanguage: 'de',
  length: 'short',
  imageDirection: 'Park im Herbst',
  sections: [
    {
      id: 's1',
      title: 'Bank',
      lines: [
        {
          id: 'l1',
          speaker: 'Julien',
          text: 'Schön hier.',
          cueImage: 'Julien sitzt auf der Bank',
        },
      ],
    },
  ],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

const board = planBoardWithoutAi(dialog, [julienSit, park])
if (board.panels.length !== 1) fail('eine Zeile = ein Bild')
const panel = board.panels[0]
if (panel.placements[0]?.match !== 'reuse') fail('sitzender Julien aus Bibliothek')
if (panel.background.match !== 'reuse') fail('Park aus Bibliothek')

const tweaked = applyDirectorNote(board, panel.id, 'Julien eher im Hintergrund')
const after = tweaked.panels[0]?.placements[0]
if (after?.depth !== 'background') fail('Regie: Hintergrund')
if (!tweaked.panels[0]?.directorNote) fail('Regie-Notiz speichern')

if (inferExpression('Julien springt und ruft Juhe') !== 'freut sich') fail('Juhe → freut sich')
if (!board.scenes.length) fail('Szenen müssen existieren')
const inserted = insertPanelAfter(board, panel.id, 'Julien springt in die Luft und ruft Juhe', [julienSit, park])
if (inserted.panels.length !== 2) fail('Zeile einfügen')
if (!inserted.panels[1]?.expressionHint) fail('Ausdruck an neuer Zeile')
if (inserted.panels[1]?.imageCue !== 'Julien springt in die Luft und ruft Juhe') {
  fail('Eingefügtes Bild trägt die Bild-Notiz')
}

console.log('OK: Storyboard nutzt Bibliothek, spiegelt, nimmt Regie an, fügt Zeilen ein')
