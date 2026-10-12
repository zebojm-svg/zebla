/**
 * Dialog → Storyboard, Bibliothek zuerst (ohne echte KI-Bilder).
 * Aufruf: npx tsx scripts/check-film-storyboard.ts
 */
import { readFileSync } from 'node:fs'
import {
  applyDirectorNote,
  applyPanelCues,
  dialogNeedsNativeTranslation,
  dropRepeatedDialogSections,
  ensureCoverageDrafts,
  cueAsksNewPicture,
  expectedSceneShotCount,
  boardFollowsDialog,
  filmScenesFromDialog,
  findReusableCloseup,
  inferExpression,
  inferPoseId,
  insertPanelAfter,
  insertSceneAfter,
  matchBackground,
  matchCharacterPose,
  matchDialogSection,
  planBoardWithoutAi,
  removeScene,
  removeScenesAfter,
  resolveDraftSectionId,
  sceneHasSpokenDialog,
  scenePlayBeats,
  sceneRepeatsEarlierDialog,
  sceneShotPlanDe,
} from '../shared/film-storyboard.ts'
import { uniqueSpeakersInDialog } from '../shared/speakers.ts'
import { lineShouldSpeak, spokenTextMatchesTarget } from '../shared/line-speech.ts'
import { inferDialogLineKind, type Dialog } from '../shared/types.ts'
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
if (fourBoard.panels[0]?.shot !== 'wide') fail('erster Salam ist das Weit-Bild / Grundbild')
if (fourBoard.panels.slice(1).some((p) => p.shot !== 'closeup')) {
  fail('wer spricht danach = Nahaufnahme, nicht der ganze Raum')
}
if (fourBoard.panels[1]?.closeupSpeaker !== 'Khan') fail('Kamera auf Khan wenn Khan spricht')
if (!sceneShotPlanDe(fourBoard.panels).includes('Dialogzeile')) fail('Plan sagt ein Bild je Zeile')

const tea: Dialog = {
  ...dialog,
  id: 'd-tea',
  title: 'Tee',
  sections: [
    {
      id: 'gaeste',
      title: 'Gäste',
      lines: [
        {
          id: 'tea1',
          speaker: 'Handlung',
          kind: 'action',
          text: 'Ramo bereitet Tee vor für seine Gäste. Er hat ein paar Freunde eingeladen.',
        },
        {
          id: 'tea2',
          speaker: 'Handlung',
          kind: 'action',
          text: 'Da klopft es an der Tür.',
          cueImage: 'Die Tür',
        },
        { id: 'tea3', speaker: 'Ramo', text: 'Salam.' },
        { id: 'tea4', speaker: 'Khan', text: 'Salam.' },
      ],
    },
  ],
}
const teaBoard = planBoardWithoutAi(tea, [])
if (teaBoard.panels[0]?.shot !== 'insert') fail('Tee zubereiten ist Zwischenbild')
if (teaBoard.panels[1]?.shot !== 'insert') fail('Klopfen ist Zwischenbild')
if (!/tür/i.test(teaBoard.panels[1]?.imageCue || '')) fail('Kamera zeigt die Tür')
if (teaBoard.panels[2]?.shot !== 'wide') fail('erster Sprecher nach der Handlung ist Grundbild')
if (teaBoard.panels[3]?.shot !== 'closeup' || teaBoard.panels[3]?.closeupSpeaker !== 'Khan') {
  fail('Khan spricht → Nahaufnahme Khan')
}
if (!/küche/i.test(teaBoard.panels[0]?.settingHint || '')) fail('Tee-Bild ist in der Küche')
if (!/wohnzimmer/i.test(teaBoard.panels[2]?.settingHint || '')) {
  fail('Begrüßung ist im Wohnzimmer, nicht in der Küche')
}
if (teaBoard.panels[2]?.settingHint === tea.filmPrompt) {
  fail('Ort ist nicht der ganze Prompt')
}
const teaPlay = scenePlayBeats(teaBoard.panels, tea)
if (!teaPlay[0]?.silent) fail('Tee-Handlung bleibt still, kein deutscher Erzähler')
if (teaPlay[0]?.line) fail('Handlung bekommt keine Sprecherzeile')
if (!teaPlay[1]?.silent) fail('Klopfen ohne Stimme')
if (!teaPlay[2]?.line || teaPlay[2].silent) fail('Ramo spricht nach dem Klopfen')
if (!cueAsksNewPicture('Da klopft es an der Tür')) fail('Klopfen braucht ein neues Bild')
if (!/wasser|kessel|tee/i.test(teaBoard.panels[0]?.soundCue || '')) {
  fail('Tee-Handlung braucht Ton-Regie (Wasser / Kessel)')
}
if (!/klopf/i.test(teaBoard.panels[1]?.soundCue || '')) fail('Klopfen braucht Ton-Regie')
if (!teaPlay[0]?.foley?.includes('fill')) fail('Auffüllen wird beim Abspielen gehört')
if (!teaPlay[1]?.foley?.includes('knock')) fail('Klopfen wird beim Abspielen gehört')
if (uniqueSpeakersInDialog(tea).includes('Handlung')) fail('Handlung bekommt keine Stimme')
if (uniqueSpeakersInDialog(tea).includes('Erzähler')) {
  fail('deutsche Tee-Handlung ist kein Erzähler')
}

const told: Dialog = {
  ...dialog,
  id: 'd-erz',
  title: 'Erzählt',
  sections: [
    {
      id: 'erz',
      title: 'Anfang',
      lines: [
        {
          id: 'n1',
          speaker: 'Erzähler',
          kind: 'narrator',
          text: 'Ramo hat Freunde eingeladen.',
        },
        { id: 'n2', speaker: 'Ramo', text: 'Salam.' },
      ],
    },
  ],
}
const toldBoard = planBoardWithoutAi(told, [])
const toldPlay = scenePlayBeats(toldBoard.panels, told)
const erzBeat = toldPlay.find((b) => !b.establishing)
if (erzBeat?.silent) fail('Erzähler spricht, Handlung bleibt still')
if (erzBeat?.line?.speaker !== 'Erzähler') fail('Erzähler-Stimme heißt Erzähler')
if (!uniqueSpeakersInDialog(told).includes('Erzähler')) {
  fail('Stimmen anpassen zeigt den Erzähler')
}
if (
  inferDialogLineKind({
    speaker: 'Erzähler',
    kind: 'action',
    text: 'Ramo hat Freunde eingeladen.',
  }) !== 'narrator'
) {
  fail('Erzähler spricht auch wenn die KI Handlung geschrieben hat')
}
if (
  inferDialogLineKind({
    speaker: 'Handlung',
    kind: 'action',
    text: 'Ramo bereitet Tee vor für seine Gäste',
  }) !== 'action'
) {
  fail('deutsche Tee-Handlung bleibt still')
}
if (
  lineShouldSpeak(
    { speaker: 'Handlung', kind: 'action', text: 'Ramo bereitet Tee vor für seine Gäste' },
    'fa',
  )
) {
  fail('deutsche Handlung nicht an TTS')
}
if (
  !lineShouldSpeak(
    { speaker: 'Erzähler', kind: 'narrator', text: 'رامو دوستانش را به چای دعوت کرده است' },
    'fa',
  )
) {
  fail('persischer Erzähler spricht')
}
if (
  lineShouldSpeak(
    { speaker: 'Erzähler', kind: 'narrator', text: 'Ramo hat Freunde eingeladen.' },
    'fa',
  )
) {
  fail('deutscher Erzählertext nicht über persischen Film')
}
if (spokenTextMatchesTarget('Once upon a time Ramo invited friends', 'fa')) {
  fail('Englisch nicht über persischen Film sprechen')
}
const offAsAction: Dialog = {
  ...told,
  id: 'd-off',
  sections: [
    {
      id: 'off',
      title: 'Anfang',
      lines: [
        { id: 'o1', speaker: 'Off', kind: 'action', text: 'Ramo hat Gäste.' },
        { id: 'o2', speaker: 'Ramo', text: 'Salam.' },
      ],
    },
  ],
}
const offPlay = scenePlayBeats(planBoardWithoutAi(offAsAction, []).panels, offAsAction)
const offBeat = offPlay.find((b) => !b.establishing)
if (offBeat?.silent) fail('Off/Erzähler spricht, bleibt nicht still')
if (!uniqueSpeakersInDialog(offAsAction).includes('Erzähler')) {
  fail('Off erscheint als Erzähler unter Stimmen anpassen')
}
if (uniqueSpeakersInDialog(offAsAction).filter((n) => n === 'Erzähler').length !== 1) {
  fail('Off und Erzähler sind dieselbe Stimme')
}

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
if (matchDialogSection(four, 'scene-xyz')) fail('unbekannte Szene darf nicht Abschnitt 1 klauen')
if (resolveDraftSectionId(four, 'scene-xyz') === 'ankunft') {
  fail('unpassende Id bleibt eigen, kein Fallback auf Szene 1')
}
if (matchDialogSection(four, '2', 1)) fail('Szene 2 ohne zweiten Abschnitt hat keinen Dialog')
if (matchDialogSection(four, '1', 1)) fail('Zahl 1 gilt nicht für die zweite Szene')

const extraBoard = insertSceneAfter(fourBoard, fourBoard.scenes[0]!.id, 'Szene 2')
const extraId = extraBoard.scenes[1]?.id
if (!extraId) fail('zweite Szene einfügen')
const extraPanels = extraBoard.panels.filter((p) => p.sceneId === extraId)
if (sceneHasSpokenDialog(extraPanels, four, 'Szene 2')) {
  fail('neue Szene spricht nicht den Dialog von Szene 1')
}
if (scenePlayBeats(extraPanels, four, 'Szene 2').some((b) => b.line)) {
  fail('Abspielen der leeren Szene bleibt stumm')
}
const stolen = extraPanels.map((p) => ({ ...p, lineIds: ['a', 'b'], sceneIndex: 1 }))
if (sceneHasSpokenDialog(stolen, four, 'Szene 2')) {
  fail('Zeilen-Ids von Szene 1 gehören nicht in Szene 2')
}
const dupFour: Dialog = {
  ...four,
  sections: [
    four.sections[0]!,
    {
      id: extraId,
      title: 'Szene 2',
      lines: four.sections[0]!.lines.map((l, i) => ({ ...l, id: `copy-${i}` })),
    },
  ],
}
const dupPanels = extraPanels.map((p) => ({ ...p, sectionId: extraId, sceneId: extraId, sceneIndex: 1 }))
if (!sceneRepeatsEarlierDialog(dupPanels, dupFour, 'Szene 2', [fourBoard.panels])) {
  fail('kopierter Dialog gilt als Wiederholung')
}
const trimmed = removeScene(extraBoard, extraId)
if (trimmed.scenes.length !== 1) fail('Szene entfernen lässt Szene 1')
const withThird = insertSceneAfter(extraBoard, extraId, 'Szene 3')
const ended = removeScenesAfter(withThird, fourBoard.scenes[0]!.id)
if (ended.scenes.length !== 1) fail('Geschichte hier beenden entfernt die folgenden Szenen')

const uniqueSecs = dropRepeatedDialogSections([
  { title: 'Eins', lines: [{ speaker: 'Ramo', text: 'Salam.' }] },
  { title: 'Zwei', lines: [{ speaker: 'Ramo', text: 'Salam.' }] },
  { title: 'Drei', lines: [{ speaker: 'Khan', text: 'Bia.' }] },
])
if (uniqueSecs.length !== 2) fail('kopierter Dialog wird nicht zur zweiten Szene')
if (uniqueSecs[1]?.title !== 'Drei') fail('echte nächste Szene bleibt')

const boardOnly = filmScenesFromDialog(four, extraBoard)
if (boardOnly.length !== 1 || boardOnly[0]?.id !== 'ankunft') {
  fail('Board zeigt nur Dialog-Szenen, keine eingefügte Extra-Szene')
}
if (!boardFollowsDialog(fourBoard, four)) fail('Board folgt dem Dialog')
const remade: Dialog = {
  ...four,
  sections: [
    {
      id: 'neu-aus-prompt',
      title: 'Vorbereitung',
      lines: [{ id: 'n1', speaker: 'Ramo', text: 'Bia.' }],
    },
  ],
}
if (boardFollowsDialog(fourBoard, remade)) {
  fail('nach neuem Dialog gehören die alten Bilder nicht mehr dazu')
}

const pageSrc = readFileSync(new URL('../src/story/FilmStoryboardPage.tsx', import.meta.url), 'utf8')
if (pageSrc.includes('Szene einfügen')) fail('Szenen entstehen nicht auf dem Board')
if (pageSrc.includes('Dialog für diese Szene schreiben')) {
  fail('Dialog wird im Text-Teil geschrieben, nicht auf den Bildern')
}
if (!pageSrc.includes('filmScenesFromDialog')) fail('Board folgt den Dialog-Szenen')
if (!pageSrc.includes('boardFollowsDialog')) fail('Board merkt wenn der Dialog neu ist')
const editorSrc = readFileSync(new URL('../src/pages/DialogEditorPage.tsx', import.meta.url), 'utf8')
if (!editorSrc.includes('filmStoryboard: null')) {
  fail('Dialog daraus machen löscht den alten Bildplan')
}
const voicesSrc = readFileSync(new URL('../src/story/FilmCastVoices.tsx', import.meta.url), 'utf8')
if (!voicesSrc.includes('Erzähler')) fail('Stimmen anpassen erklärt die Erzählerstimme')

const aiSrc = readFileSync(new URL('../lib/ai.ts', import.meta.url), 'utf8')
if (!aiSrc.includes('HIER im Dialog')) fail('Prompt sagt: Szenen im Dialog')
if (!aiSrc.includes('dropRepeatedDialogSections')) fail('kopierte Dialog-Szenen fallen weg')
if (!aiSrc.includes('kind')) fail('Dialog darf Handlung und Erzähler')
if (!aiSrc.includes('Niemals die Geschichte als kind=action')) {
  fail('Prompt sagt: Geschichte ist Erzähler, nicht stille Handlung')
}
if (!aiSrc.includes('Niemals Englisch')) {
  fail('Gesprochene Zeilen dürfen kein Englisch sein')
}
if (!aiSrc.includes('Augenhöhe eines stehenden Erwachsenen')) {
  fail('Klopf-Bild: Kamera auf Augenhöhe, nicht den Boden')
}
if (!aiSrc.includes('nicht die Füsse')) {
  fail('Küchen-Bild: nicht die Füsse')
}
if (!aiSrc.includes('orderTeaBeats')) fail('Tee-Reihenfolge Wasser vor Herd')
if (!aiSrc.includes('Kessel pfeift')) fail('Prompt verlangt Pfeifen als eigene Handlung')
if (!aiSrc.includes('plätschert')) fail('Prompt verlangt Eingießen als Geräusch')
if (!aiSrc.includes('inferSoundCueDe')) fail('fehlende Ton-Regie wird aus der Handlung ergänzt')
if (!aiSrc.includes('const system =')) fail('Dialog-Prompt ist ein Text, keine verschmolzenen Templates')
if (/braucht\.`\s*`\$\{prompt/.test(aiSrc)) {
  fail('Zwei Template-Strings hintereinander — Dialog daraus machen stürzt ab')
}
const planSrc = readFileSync(new URL('../lib/film-storyboard.ts', import.meta.url), 'utf8')
if (!planSrc.includes('shot="insert"')) fail('Regie darf Zwischenbilder planen')
if (!planSrc.includes('closeup')) fail('Regie zeigt wer spricht')
if (!planSrc.includes('Zwillinge')) fail('Regie: keine Zwillingsfiguren im Zwischenbild')
if (!planSrc.includes('leeres Wohnzimmer')) fail('Regie: Gäste bleiben im Weit-Bild')

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
