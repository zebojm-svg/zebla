/**
 * Dialog → Storyboard, Bibliothek zuerst (ohne echte KI-Bilder).
 * Aufruf: npx tsx scripts/check-film-storyboard.ts
 */
import {
  applyDirectorNote,
  applyPanelCues,
  dialogNeedsNativeTranslation,
  ensureCoverageDrafts,
  cueAsksNewPicture,
  expectedSceneShotCount,
  findReusableCloseup,
  inferExpression,
  inferPoseId,
  insertPanelAfter,
  matchBackground,
  matchCharacterPose,
  planBoardWithoutAi,
  resolveDraftSectionId,
  sceneShotPlanDe,
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
const sofa: StoryLibraryAsset = {
  ...park,
  id: 'lib-sofa',
  type: 'environment',
  name: 'Wohnzimmer',
  description: 'Wohnzimmer',
  tags: ['wohnzimmer'],
  imageUrl: 'https://example.com/sofa.png',
}
if (matchBackground('Kissen um einen niedrigen Holztisch, persische Teppiche', [sofa]).match === 'reuse') {
  fail('Altes Wohnzimmer nicht für einen anderen Dialog-Ort nehmen')
}

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
if (board.panels.length !== 1) fail('Eine Dialogzeile → ein Bild')
const panel = board.panels[0]
if (panel.shot !== 'wide') fail('erstes Bild ist Weit')
if (panel.lineIds.length !== 1 || panel.lineIds[0] !== 'l1') fail('Bild hängt an der Dialogzeile')
if (panel.placements[0]?.match !== 'reuse') fail('sitzender Julien aus Bibliothek')
if (panel.background.match !== 'reuse') fail('Park aus Bibliothek')
if (!cueAsksNewPicture('lass Ramo aufstehen')) fail('Aufstehen braucht ein neues Bild')
if (cueAsksNewPicture('Wie das vorige Bild. Khan spricht.')) fail('Wie zuvor bleibt dasselbe Bild')
const reusedClose = findReusableCloseup(
  {
    ...board,
    panels: board.panels.map((p) => ({
      ...p,
      shot: 'closeup' as const,
      closeupSpeaker: 'Julien',
      stillUrl: 'https://example.com/julien-cu.png',
    })),
  },
  'Julien',
  board.panels[0]?.expressionHint,
  'other',
)
if (reusedClose !== 'https://example.com/julien-cu.png') fail('Nahaufnahme wiederverwenden')
const reusedOtherMood = findReusableCloseup(
  {
    ...board,
    panels: board.panels.map((p) => ({
      ...p,
      shot: 'closeup' as const,
      closeupSpeaker: 'Julien',
      stillUrl: 'https://example.com/julien-cu.png',
    })),
  },
  'Julien',
  'freut sich',
  'other',
)
if (reusedOtherMood !== 'https://example.com/julien-cu.png') {
  fail('Dieselbe Nahaufnahme auch bei anderer Mimik — nur Augenbrauen/Mund ändern')
}

const cued = applyPanelCues(board, panel.id, {
  soundCue: 'leise persische Musik, ab und zu eine Nuss knacken',
  imageCue: 'Ubai schaut müde',
})
if (cued.panels[0]?.soundCue !== 'leise persische Musik, ab und zu eine Nuss knacken') {
  fail('Ton-Regie speichern')
}
if (cued.panels[0]?.imageCue !== 'Ubai schaut müde') fail('Bild-Regie speichern')

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

const four: Dialog = {
  ...dialog,
  id: 'd-cast',
  title: 'Wohnzimmer',
  sections: [
    {
      id: 'ankunft',
      title: 'Ankunft und Begrüßung',
      lines: [
        { id: 'a', speaker: 'Ramo', text: 'Salam.' },
        { id: 'b', speaker: 'Khan', text: 'Salam.' },
        { id: 'c', speaker: 'Ubai', text: 'Salam.' },
        { id: 'd', speaker: 'Schöme', text: 'Salam.' },
      ],
    },
  ],
}
const fourBoard = planBoardWithoutAi(four, [])
if (fourBoard.panels.length !== 4) fail('Vier Dialogzeilen → vier Bilder')
if (expectedSceneShotCount(four, 'ankunft') !== 4) fail('erwartet 4 Bilder')
if (fourBoard.panels.filter((p) => (p.shot ?? 'wide') === 'wide').length !== 4) {
  fail('ohne Bild-Notiz bleiben alle beim Weit-Bild')
}
if (!sceneShotPlanDe(fourBoard.panels).includes('Dialogzeile')) fail('Plan sagt ein Bild je Zeile')

const geminiWrongId = ensureCoverageDrafts(four, [
  {
    sectionId: '1',
    shot: 'wide',
    caption: 'Wohnzimmer',
    lineIds: ['a'],
  },
])
if (geminiWrongId.length !== 4) fail('Gemini-Id 1 wird auf den Abschnitt gemappt, Coverage bleibt 4 Zeilen')
if (resolveDraftSectionId(four, 'Ankunft und Begrüßung') !== 'ankunft') {
  fail('Szenentitel auf Abschnitts-Id')
}
if (resolveDraftSectionId(four, 'Szene 1: Ankunft und Begrüßung') !== 'ankunft') {
  fail('«Szene 1: …» trifft denselben Abschnitt')
}

const unnamed: Dialog = {
  ...dialog,
  sections: [
    {
      id: 's-text',
      title: 'Dialog',
      lines: [
        { id: 't1', speaker: '', text: 'Ramo: Salam, Khan.' },
        { id: 't2', speaker: '', text: 'Khan: Salam.' },
      ],
    },
  ],
}
const fromText = ensureCoverageDrafts(unnamed, [])
if (fromText.length !== 2) fail('Zwei Zeilen → zwei Bilder')
if (!fromText.some((d) => (d.characters ?? []).some((c) => c.name === 'Ramo'))) {
  fail('Ramo aus «Name:» im Text')
}

const needsDe: Dialog = {
  ...four,
  sections: [
    {
      ...four.sections[0]!,
      lines: [{ id: 'z', speaker: 'Ramo', text: 'Salam.' }],
    },
  ],
}
if (!dialogNeedsNativeTranslation(needsDe)) fail('ohne normale Übersetzung fehlt Deutsch')
const hasDe: Dialog = {
  ...needsDe,
  sections: [
    {
      ...needsDe.sections[0]!,
      lines: [
        {
          id: 'z',
          speaker: 'Ramo',
          text: 'Salam.',
          nativeText: 'Hallo.',
          birkenbihl: [{ text: 'Salam', translation: 'Hallo' }],
        },
      ],
    },
  ],
}
if (dialogNeedsNativeTranslation(hasDe)) fail('mit nativeText ist Deutsch da')

console.log('OK: Storyboard nutzt Bibliothek, spiegelt, nimmt Regie an, fügt Zeilen ein')
