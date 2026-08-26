/**
 * Standbilder Szene für Szene (ohne echte KI-Bilder).
 * Aufruf: npx tsx scripts/check-film-stills.ts
 */
import {
  applyPanelStill,
  buildFilmStillPrompt,
  filmStillLanguageEn,
  panelsForScene,
  panelsNeedingStills,
  previousStillUrlInScene,
  referenceUrlsForPanel,
  sceneStillProgress,
  stillLibraryHintDe,
  stillTimeoutHintDe,
} from '../shared/film-stills.ts'
import {
  panelDialogueLines,
  panelSpeakLines,
  scenePreviewBeats,
} from '../shared/film-storyboard.ts'
import { isImageGenPath } from '../shared/api-timeout.ts'
import {
  buildBoardFromDrafts,
  draftPanelsFromDialog,
  planBoardWithoutAi,
} from '../shared/film-storyboard.ts'
import type { Dialog } from '../shared/types.ts'
import type { StoryLibraryAsset } from '../shared/story-types.ts'

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

if (!isImageGenPath('/film-storyboard-still')) fail('Standbild-Route muss als Bild-Wartezeit gelten')
if (!isImageGenPath('/film-storyboard-sketch')) fail('Skizze bleibt Bild-Route')

const julien: StoryLibraryAsset = {
  id: 'lib-julien',
  type: 'character',
  name: 'Julien',
  imageUrl: 'https://example.com/julien.png',
  tags: ['standing-front'],
  legPoseId: 'standing',
  headAngleId: 'front',
  armPoseId: 'relaxed',
  createdAt: '2026-01-01',
}

const park: StoryLibraryAsset = {
  id: 'lib-park',
  type: 'environment',
  name: 'Park',
  description: 'Park Bank',
  imageUrl: 'https://example.com/park.png',
  tags: ['park'],
  createdAt: '2026-01-01',
}

const dialog: Dialog = {
  id: 'd1',
  userId: 'u1',
  title: 'Le Cadeau Malentendu',
  sourceLanguage: 'de',
  targetLanguage: 'fr',
  length: 'short',
  imageDirection: 'Park',
  sections: [
    {
      id: 's1',
      title: 'La Chasse aux Cadeaux',
      lines: [
        { id: 'l1', speaker: 'Julien', text: 'Ein Geschenk!', cueImage: 'Julien steht im Park' },
        { id: 'l2', speaker: 'Julien', text: 'Ich winke.', cueImage: 'Julien winkt' },
      ],
    },
    {
      id: 's2',
      title: 'Szene 2',
      lines: [{ id: 'l3', speaker: 'Tara', text: 'Hallo', cueImage: 'Tara steht' }],
    },
  ],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

const board = planBoardWithoutAi(dialog, [julien, park])
const scene1 = board.scenes[0]
if (!scene1) fail('Szene 1 fehlt')
const s1 = panelsForScene(board, scene1.id)
if (s1.length < 1) fail('Szene 1 braucht Bilder')
const scene2Id = board.scenes[1]?.id
if (scene2Id && panelsForScene(board, scene2Id).some((p) => s1.some((x) => x.id === p.id))) {
  fail('Szenen dürfen sich nicht mischen')
}

const prompt = buildFilmStillPrompt({
  caption: s1[0]!.caption,
  imageCue: s1[0]!.imageCue,
  settingHint: s1[0]!.settingHint,
  expressionHint: s1[0]!.expressionHint,
  sceneTitle: scene1.title,
  styleId: 'illustration-lebendig',
  names: ['Julien'],
  poseHints: ['Julien: Stehen'],
  hasLibraryRefs: true,
  targetLanguage: 'fr',
})
if (!prompt.toLowerCase().includes('still')) fail('Prompt muss Standbild sagen')
if (!prompt.includes('graphic novel') && !prompt.includes('watercolor')) {
  fail('Prompt muss den Stil tragen')
}
if (!prompt.toLowerCase().includes('exact person') && !prompt.toLowerCase().includes('keep')) {
  fail('Prompt muss die Figur festhalten')
}
if (filmStillLanguageEn('fr') !== 'French') fail('Französisch im Bild-Prompt')
if (!prompt.includes('French')) fail('Schilder und Prospekt müssen auf Französisch sein')
if (!/in-world text|stall labels|prospectus/i.test(prompt)) {
  fail('Prompt muss sichtbaren Text in der Szene erlauben (Schilder, Prospekt)')
}
if (!prompt.includes('Ignore any earlier')) {
  fail('Stil-Regel «kein Text» muss für Schilder aufgehoben werden')
}
if (!prompt.includes('Bratwurst') || !prompt.includes('Glühwein')) {
  fail('Prompt muss deutsche Stand-Schilder (Bratwurst/Glühwein) verbieten')
}

const fixPrompt = buildFilmStillPrompt({
  caption: 'Julien und Tara schauen in den Prospekt',
  imageCue: 'beide halten den Prospekt',
  hasLibraryRefs: true,
  targetLanguage: 'fr',
  stillCorrection: 'Prospekt fehlt, beide schauen in die Luft',
  correctingExisting: true,
})
if (!fixPrompt.includes('Prospekt fehlt')) fail('Korrektur-Notiz muss ins Bild')
if (!fixPrompt.toLowerCase().includes('current still')) {
  fail('Korrigieren muss das vorhandene Bild als Vorlage nehmen')
}

const refs = referenceUrlsForPanel(s1[0]!)
if (!refs.includes('https://example.com/julien.png')) fail('Julien-Foto aus Bibliothek als Vorlage')
if (!refs.includes('https://example.com/park.png')) fail('Park als Vorlage')

const fixRefs = referenceUrlsForPanel(
  s1[0]!,
  'https://example.com/prev.png',
  'https://example.com/this-still.png',
)
if (fixRefs[0] !== 'https://example.com/this-still.png') {
  fail('Beim Korrigieren zuerst das aktuelle Standbild')
}

if (scene2Id) {
  const missingHint = stillLibraryHintDe(panelsForScene(board, scene2Id))
  if (!missingHint || !missingHint.toLowerCase().includes('bibliothek')) {
    fail('Fehlende Figur muss auf die Bibliothek zeigen')
  }
}

let progress = sceneStillProgress(s1)
if (progress.done !== 0) fail('Ohne stillUrl ist nichts fertig')
if (progress.total !== s1.length) fail('total = Anzahl Bilder der Szene')

const withStill = applyPanelStill(board, s1[0]!.id, 'https://example.com/still1.png', 'illustration-lebendig')
progress = sceneStillProgress(panelsForScene(withStill, scene1.id), 'illustration-lebendig')
if (progress.done !== 1) fail('Ein gespeichertes Standbild zählt')

const need = panelsNeedingStills(panelsForScene(withStill, scene1.id), 'illustration-lebendig')
if (need.some((p) => p.id === s1[0]!.id)) fail('Fertiges Bild nicht nochmal, ausser Stil wechselt')
if (need.length !== s1.length - 1) fail('Nur fehlende Bilder der Szene')

const otherStyle = panelsNeedingStills(panelsForScene(withStill, scene1.id), 'fotorealistisch')
if (!otherStyle.some((p) => p.id === s1[0]!.id)) fail('Anderer Stil → Bild neu')

const forceAll = panelsNeedingStills(panelsForScene(withStill, scene1.id), 'illustration-lebendig', true)
if (forceAll.length !== s1.length) fail('Nochmals erzeugen nimmt alle Bilder')

if (s1[1]) {
  const prev = previousStillUrlInScene(withStill, s1[1])
  if (prev !== 'https://example.com/still1.png') fail('Nächstes Bild darf das vorige Standbild sehen')
}

const kept = buildBoardFromDrafts(
  dialog,
  draftPanelsFromDialog(dialog),
  [julien, park],
  'rules',
  withStill,
)
const keptPanel = kept.panels.find((p) => p.id === s1[0]!.id)
if (keptPanel?.stillUrl !== 'https://example.com/still1.png') {
  fail('Standbild muss beim Neu-Planen bleiben')
}

const timeoutDe = stillTimeoutHintDe('Zeitlimit überschritten. Bitte nur ein Bild auf einmal generieren.')
if (!timeoutDe.includes('fertigen Bilder bleiben')) fail('Timeout-Text: fertige Bilder bleiben')
if (!timeoutDe.includes('Diese Szene erzeugen')) fail('Timeout-Text nennt den Knopf')

const talk = panelDialogueLines(s1[0]!, dialog)
if (!talk.some((l) => l.speaker === 'Julien' && l.text.includes('Geschenk'))) {
  fail('Unter dem Bild muss der Dialog stehen (Sprecher + Text)')
}
const spoken = panelSpeakLines(s1[0]!, dialog)
if (!spoken[0]?.text) fail('Szene abspielen braucht den gesprochenen Text')
const beats = scenePreviewBeats(s1, dialog)
if (beats.length !== s1.length) fail('Vorschau: ein Takt pro Bild')
if (beats[0]?.lines[0]?.speaker !== 'Julien') fail('Vorschau-Takt trägt den Sprecher')

const keptCorrection = {
  ...withStill,
  panels: withStill.panels.map((p) =>
    p.id === s1[0]!.id ? { ...p, stillCorrection: 'Stand auf Französisch' } : p,
  ),
}
const replayed = buildBoardFromDrafts(
  dialog,
  draftPanelsFromDialog(dialog),
  [julien, park],
  'rules',
  keptCorrection,
)
const replayedPanel = replayed.panels.find((p) => p.id === s1[0]!.id)
if (replayedPanel?.stillCorrection !== 'Stand auf Französisch') {
  fail('Korrektur-Notiz muss beim Neu-Planen bleiben')
}

console.log('OK: Szene für Szene Standbilder, Dialog, Korrektur, Sprache, Vorschau')
