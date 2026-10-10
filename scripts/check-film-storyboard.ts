/**
 * Dialog → Storyboard, Bibliothek zuerst (ohne echte KI-Bilder).
 * Aufruf: npx tsx scripts/check-film-storyboard.ts
 */
import {
  applyDirectorNote,
  dialogNeedsNativeTranslation,
  ensureCoverageDrafts,
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
if (board.panels.length !== 2) fail('Szene = Weit + Nahaufnahme je Sprecher')
const panel = board.panels[0]
if (panel.shot !== 'wide') fail('erstes Bild ist Weit')
if (board.panels[1]?.shot !== 'closeup') fail('zweites Bild ist Nahaufnahme')
if (board.panels[1]?.closeupSpeaker !== 'Julien') fail('Nahaufnahme Julien')
if (board.panels[1]?.placements[0]?.poseId !== 'sitting') {
  fail('Nahaufnahme nimmt die Sitz-Pose der Szene, kein extra Stehen')
}
const closeDraft = ensureCoverageDrafts(dialog, []).find((d) => d.shot === 'closeup')
if (!closeDraft?.imageCue.toLowerCase().includes('platz')) {
  fail('Nahaufnahme-Text: Person bleibt am Platz')
}
if (panel.placements[0]?.match !== 'reuse') fail('sitzender Julien aus Bibliothek')
if (panel.background.match !== 'reuse') fail('Park aus Bibliothek')
const reusedClose = findReusableCloseup(
  { ...board, panels: board.panels.map((p, i) => (i === 1 ? { ...p, stillUrl: 'https://example.com/julien-cu.png' } : p)) },
  'Julien',
  board.panels[1]?.expressionHint,
  'other',
)
if (reusedClose !== 'https://example.com/julien-cu.png') fail('Nahaufnahme wiederverwenden')
const reusedOtherMood = findReusableCloseup(
  { ...board, panels: board.panels.map((p, i) => (i === 1 ? { ...p, stillUrl: 'https://example.com/julien-cu.png' } : p)) },
  'Julien',
  'freut sich',
  'other',
)
if (reusedOtherMood !== 'https://example.com/julien-cu.png') {
  fail('Dieselbe Nahaufnahme auch bei anderer Mimik — nur Augenbrauen/Mund ändern')
}

const tweaked = applyDirectorNote(board, panel.id, 'Julien eher im Hintergrund')
const after = tweaked.panels[0]?.placements[0]
if (after?.depth !== 'background') fail('Regie: Hintergrund')
if (!tweaked.panels[0]?.directorNote) fail('Regie-Notiz speichern')

if (inferExpression('Julien springt und ruft Juhe') !== 'freut sich') fail('Juhe → freut sich')
if (!board.scenes.length) fail('Szenen müssen existieren')
const inserted = insertPanelAfter(board, panel.id, 'Julien springt in die Luft und ruft Juhe', [julienSit, park])
if (inserted.panels.length !== 3) fail('Zeile einfügen')
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
if (fourBoard.panels.length !== 5) fail('Vier Sprecher → 1 Weit + 4 Nahaufnahmen')
if (expectedSceneShotCount(four, 'ankunft') !== 5) fail('erwartet 5 Bilder')
if (fourBoard.panels.filter((p) => p.shot === 'closeup').length !== 4) {
  fail('vier Nahaufnahmen')
}
if (!sceneShotPlanDe(fourBoard.panels).includes('Ramo')) fail('Plan nennt Ramo')

const geminiWrongId = ensureCoverageDrafts(four, [
  {
    sectionId: '1',
    shot: 'wide',
    caption: 'Wohnzimmer',
    lineIds: ['a'],
  },
])
if (geminiWrongId.length !== 5) fail('Gemini-Id 1 wird auf den Abschnitt gemappt, Coverage bleibt 5')
if (resolveDraftSectionId(four, 'Ankunft und Begrüßung') !== 'ankunft') {
  fail('Szenentitel auf Abschnitts-Id')
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
if (fromText.length !== 3) fail('Sprecher aus «Name:» im Text → Weit + 2 Nah')
if (!fromText.some((d) => d.closeupSpeaker === 'Ramo')) fail('Nahaufnahme Ramo aus dem Text')

const needsDe: Dialog = {
  ...four,
  sections: [
    {
      ...four.sections[0]!,
      lines: [{ id: 'z', speaker: 'Ramo', text: 'Salam.' }],
    },
  ],
}
if (!dialogNeedsNativeTranslation(needsDe)) fail('ohne Birkenbihl fehlt Deutsch')
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
          birkenbihl: [{ text: 'Salam', translation: 'Hallo' }],
        },
      ],
    },
  ],
}
if (dialogNeedsNativeTranslation(hasDe)) fail('mit Birkenbihl ist Deutsch da')

console.log('OK: Storyboard nutzt Bibliothek, spiegelt, nimmt Regie an, fügt Zeilen ein')
