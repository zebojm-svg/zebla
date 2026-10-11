/**
 * Standbilder Szene für Szene (ohne echte KI-Bilder).
 * Aufruf: npx tsx scripts/check-film-stills.ts
 */
import {
  applyPanelStill,
  buildFilmStillPrompt,
  closeupCameraLine,
  closeupGenderLine,
  correctionIsFaceOnly,
  correctFromUrlForPanel,
  correctionRewritesPerson,
  filmStillLanguageEn,
  genderFromPictureNote,
  gazeLockEn,
  gazeNoteDe,
  panelsForScene,
  panelsNeedingStills,
  personNamedInCorrection,
  previousStillUrlInScene,
  referenceUrlsForPanel,
  replaceStillUrl,
  sceneContinuityBlock,
  sceneGrundbildPanel,
  sceneStillProgress,
  sceneWideStillUrl,
  seatingLockEn,
  seatingNoteDe,
  stillAttachmentInstruction,
  stillLibraryHintDe,
  stillTimeoutHintDe,
} from '../shared/film-stills.ts'
import { genderFromKnownName, guessSpeakerGenderFromName } from '../lib/speaker-gender.ts'
import {
  buildBoardFromDrafts,
  draftPanelsFromDialog,
  panelAddressee,
  panelDialogueLines,
  panelSpeakLines,
  planBoardWithoutAi,
  scenePlayBeats,
  scenePreviewBeats,
} from '../shared/film-storyboard.ts'
import { closeupCropBox, closeupSpaceLine, seatSideFromX } from '../shared/film-closeup-space.ts'
import { lookForCharacterName } from '../shared/story-character-looks.ts'
import { isImageGenPath } from '../shared/api-timeout.ts'
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
        {
          id: 'l1',
          speaker: 'Julien',
          text: 'Ein Geschenk!',
          cueImage: 'Julien steht im Park',
          birkenbihl: [{ text: 'Ein Geschenk!', translation: 'Un cadeau !' }],
        },
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
  beatIndex: 2,
  beatTotal: 5,
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
if (!prompt.toLowerCase().includes('collage') && !prompt.toLowerCase().includes('cut-out') && !prompt.toLowerCase().includes('into that exact room')) {
  fail('Prompt muss Collage/Freisteller-Kleben verbieten')
}
if (!prompt.toLowerCase().includes('different') && !prompt.toLowerCase().includes('must look different')) {
  fail('Jedes Bild muss ein neuer Moment sein')
}
if (!prompt.includes('moment 2 of 5')) fail('Prompt muss Bild 2 von 5 als eigenen Moment nennen')
if (!prompt.toLowerCase().includes('identity plates') && !prompt.toLowerCase().includes('into that exact room') && !prompt.toLowerCase().includes('matching the dialogue')) {
  fail('Prompt muss Figuren in den Raum malen, nicht als Sticker kleben')
}
if (!prompt.toLowerCase().includes('hips on the seat')) {
  fail('Prompt muss Sitzen auf dem Möbel verlangen, nicht davor kleben')
}
const closePrompt = buildFilmStillPrompt({
  caption: 'Khan spricht',
  imageCue: 'Nahaufnahme Khan',
  hasLibraryRefs: true,
  targetLanguage: 'fa',
  shot: 'closeup',
  closeupSpeaker: 'Khan',
  names: ['Khan'],
  speakerGender: 'male',
})
if (!closePrompt.toLowerCase().includes('close-up')) fail('Nahaufnahme muss Close-up verlangen')
if (!closePrompt.toLowerCase().includes('eyebrows')) fail('Nahaufnahme zeigt Augenbrauen')
if (!closePrompt.toLowerCase().includes('head and shoulders')) fail('Nahaufnahme ist Kopf und Schultern')
if (!closePrompt.toLowerCase().includes('cut-out') && !closePrompt.toLowerCase().includes('floating')) {
  fail('Nahaufnahme darf kein Freisteller-Torso sein')
}
if (!closePrompt.toLowerCase().includes('zoom') && !closePrompt.toLowerCase().includes('push-in')) {
  fail('Nahaufnahme zoomt in die Übersicht')
}
if (!closePrompt.toLowerCase().includes('physically') && !closePrompt.toLowerCase().includes('perspective')) {
  fail('Nahaufnahme ist Kamera näher, nicht nur Zoom-Wort')
}
if (!closePrompt.toLowerCase().includes('cropped screenshot') && !closePrompt.toLowerCase().includes('cut-out of the wide')) {
  fail('Nahaufnahme darf kein Ausschnitt des Weit-Bilds sein')
}
if (!closePrompt.toLowerCase().includes('parallax') && !closePrompt.toLowerCase().includes('film from')) {
  fail('Nahaufnahme verlangt neue Kameraposition, nicht Pixel-Zoom')
}
if (!closePrompt.toLowerCase().includes('opaque') && !closePrompt.toLowerCase().includes('iris')) {
  fail('Nahaufnahme verlangt undurchsichtige Augen')
}
if (closePrompt.toLowerCase().includes('bokeh') || closePrompt.toLowerCase().includes('out-of-focus')) {
  fail('Nahaufnahme darf keinen unscharfen Studio-Hintergrund verlangen')
}
if (!closePrompt.toLowerCase().includes('this speaker is male')) fail('Khan bleibt männlich')
const schoemePrompt = buildFilmStillPrompt({
  caption: 'Schöme spricht',
  imageCue: 'Nahaufnahme Schöme',
  hasLibraryRefs: true,
  targetLanguage: 'fa',
  shot: 'closeup',
  closeupSpeaker: 'Schöme',
  names: ['Schöme'],
})
if (!schoemePrompt.toLowerCase().includes('boy into a girl')) {
  fail('Ohne Geschlechtsangabe: nicht aus dem Namen ein Mädchen machen')
}
if (!closePrompt.toLowerCase().includes('3d room') && !closePrompt.toLowerCase().includes('behind this person')) {
  fail('Nahaufnahme kennt den Platz im Raum')
}
const schoemeBoy = buildFilmStillPrompt({
  caption: 'Schöme spricht',
  hasLibraryRefs: true,
  targetLanguage: 'fa',
  shot: 'closeup',
  closeupSpeaker: 'Schöme',
  names: ['Schöme'],
  speakerGender: 'male',
  speakerX: 22,
  settingHint: 'Küche, Tisch',
})
if (!schoemeBoy.toLowerCase().includes('this speaker is male')) fail('Schöme-Prompt: Junge')
if (!schoemeBoy.toLowerCase().includes('left')) fail('Schöme sitzt links im Raum')
const mimicPrompt = buildFilmStillPrompt({
  caption: 'Khan lacht',
  shot: 'closeup',
  closeupSpeaker: 'Khan',
  hasLibraryRefs: true,
  targetLanguage: 'fa',
  correctingExisting: true,
  stillCorrection: 'Only change facial muscles: freut sich',
})
if (!mimicPrompt.toLowerCase().includes('facial muscles') && !mimicPrompt.toLowerCase().includes('eyebrows')) {
  fail('Mimik ändert nur das Gesicht, nicht die ganze Nahaufnahme')
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
const sceneRefs = referenceUrlsForPanel(s1[0]!, 'https://example.com/prev.png')
if (sceneRefs[0] === 'https://example.com/prev.png') {
  fail('Nicht das vorige Standbild als Vorlage — sonst werden alle Bilder gleich')
}
if (sceneRefs[0] !== 'https://example.com/park.png') {
  fail('Zuerst der vollständige Raum, dann die Figuren')
}

const fixRefs = referenceUrlsForPanel(
  s1[0]!,
  'https://example.com/prev.png',
  'https://example.com/this-still.png',
)
if (fixRefs[0] !== 'https://example.com/this-still.png') {
  fail('Beim Korrigieren zuerst das aktuelle Standbild')
}

const closePanel = {
  ...s1[0]!,
  id: 'cu-test',
  shot: 'closeup' as const,
  closeupSpeaker: 'Julien',
}
const cuWithBg = {
  ...closePanel,
  placements: [{ ...closePanel.placements[0]!, imageUrl: 'https://example.com/julien.png' }],
  background: { ...closePanel.background, imageUrl: 'https://example.com/park.png', match: 'reuse' as const },
}
const cuRefs = referenceUrlsForPanel(
  cuWithBg,
  undefined,
  undefined,
  'https://example.com/wide.png',
)
if (cuRefs[0] !== 'https://example.com/wide.png') fail('Nahaufnahme zoomt zuerst in die Übersicht')
if (cuRefs.includes('https://example.com/park.png')) {
  fail('Nahaufnahme hängt nicht den ganzen Raum als Vorlage an')
}
if (cuRefs.includes('https://example.com/julien.png')) {
  fail('Nahaufnahme nimmt nicht das Bibliothek-Porträt (sonst wird Schöme wieder ein Mädchen)')
}
const withWide = applyPanelStill(board, s1[0]!.id, 'https://example.com/wide.png', 'illustration-lebendig')
if (sceneWideStillUrl(withWide, closePanel) !== 'https://example.com/wide.png') {
  fail('Weit-Bild der Szene für die Nahaufnahme finden')
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

const fresh = buildBoardFromDrafts(
  dialog,
  draftPanelsFromDialog(dialog),
  [julien, park],
  'rules',
)
const freshPanel = fresh.panels.find((p) => p.id === s1[0]!.id)
if (freshPanel?.stillUrl) fail('Vom Text neu darf keine alten Standbilder behalten')

const timeoutDe = stillTimeoutHintDe('Zeitlimit überschritten. Bitte nur ein Bild auf einmal generieren.')
if (!timeoutDe.includes('fertigen Bilder bleiben')) fail('Timeout-Text: fertige Bilder bleiben')
if (!timeoutDe.includes('Diese Szene erzeugen')) fail('Timeout-Text nennt den Knopf')

const talk = panelDialogueLines(s1[0]!, dialog)
if (!talk.some((l) => l.speaker === 'Julien' && l.text.includes('Geschenk'))) {
  fail('Unter dem Bild muss der Dialog stehen (Sprecher + Text)')
}
if (!talk.some((l) => l.nativeDe?.includes('cadeau'))) {
  fail('Unter der Zielsprache die Übersetzung zeigen')
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

if (guessSpeakerGenderFromName('Schöme', 2) !== 'male') fail('Schöme ist ein Junge, kein Mädchen')
if (guessSpeakerGenderFromName('Shome', 0) !== 'male') fail('Shome = Schöme, männlich')
if (guessSpeakerGenderFromName('Khan', 0) !== 'male') fail('Khan ist männlich')
if (genderFromKnownName('Schöme') !== 'male') fail('Schöme ohne Index ist männlich')
if (genderFromKnownName('Xyzzy') !== undefined) fail('Unbekannter Name: Geschlecht nicht raten')
if (!lookForCharacterName('Schöme')?.identityLock.toLowerCase().includes('boy')) {
  fail('Schöme-Look sperrt den Jungen')
}
if (!lookForCharacterName('Shome')?.identityLock.toLowerCase().includes('boy')) {
  fail('Shome findet denselben Schöme-Look')
}
if (seatSideFromX(20) !== 'left' || seatSideFromX(80) !== 'right') fail('Platz links/rechts')
const leftBox = closeupCropBox(1920, 1080, 18, true)
const rightBox = closeupCropBox(1920, 1080, 82, true)
if (leftBox.left >= rightBox.left) fail('Zoom-Fenster folgt der Person')
if (Math.abs(leftBox.width / leftBox.height - 16 / 9) > 0.08) fail('Zoom bleibt 16:9')
if (!closeupGenderLine().toLowerCase().includes('boy into a girl')) {
  fail('Ohne Angabe nicht das Geschlecht aus dem Namen raten')
}

if (!correctionRewritesPerson('Schöme ist ein Mann')) fail('«ist ein Mann» wechselt die Person')
if (correctionRewritesPerson('Mund etwas offener')) fail('Nur Mimik ist kein Personenwechsel')
if (genderFromPictureNote('Schöme ist ein Mann') !== 'male') fail('Notiz: Schöme männlich')
if (genderFromPictureNote('kein Mädchen') !== 'male') fail('Notiz: kein Mädchen = Junge')
if (genderFromPictureNote('Mund etwas offener')) fail('Mimik setzt kein Geschlecht')

const manPrompt = buildFilmStillPrompt({
  caption: 'Schöme spricht',
  hasLibraryRefs: true,
  targetLanguage: 'fa',
  shot: 'closeup',
  closeupSpeaker: 'Schöme',
  names: ['Schöme'],
  speakerGender: 'male',
  correctingExisting: true,
  stillCorrection: 'Schöme ist ein Mann',
})
if (manPrompt.toLowerCase().includes('change only facial muscles')) {
  fail('Geschlecht wechseln darf das Gesicht nicht einfrieren')
}
if (!manPrompt.toLowerCase().includes('sex and face may change')) {
  fail('Geschlecht wechseln: Gesicht neu')
}
if (!manPrompt.toLowerCase().includes('this speaker is male')) fail('Geschlecht-Prompt: männlich')
if (!manPrompt.toLowerCase().includes('wrong-gender')) {
  fail('Geschlecht wechseln: altes Gesicht nicht behalten')
}
if (!manPrompt.toLowerCase().includes('cropped screenshot') && !manPrompt.toLowerCase().includes('new closer')) {
  fail('Geschlecht wechseln: neu filmen, nicht ausschneiden')
}
if (!manPrompt.toLowerCase().includes('push-in') && !manPrompt.toLowerCase().includes('zoom')) {
  fail('Geschlecht wechseln: Zoom in die Übersicht, kein neues Porträt')
}

const seatPeople = [
  { name: 'Schöme', x: 18, poseId: 'sitting' as const, poseHint: 'sitzt' },
  { name: 'Khan', x: 50, poseId: 'sitting' as const, poseHint: 'sitzt' },
  { name: 'Ubai', x: 82, poseId: 'sitting' as const, poseHint: 'sitzt' },
]
const seatEn = seatingLockEn(seatPeople)
if (!seatEn.toLowerCase().includes('schöme') || !seatEn.toLowerCase().includes('left')) {
  fail('Sitzplan: Schöme links')
}
if (!seatEn.toLowerCase().includes('stays in that seat')) fail('Sitzplan sperrt die Plätze')
const seatDe = seatingNoteDe(seatPeople)
if (!seatDe || !seatDe.includes('Schöme sitzt links') || !seatDe.includes('Khan sitzt in der Mitte')) {
  fail('Sitzplan auf Deutsch')
}
if (!gazeLockEn('Schöme', 'Khan').toLowerCase().includes('looks at khan')) {
  fail('Blick: Schöme schaut Khan an')
}
if (gazeNoteDe('Schöme', 'Khan') !== 'Schöme schaut Khan an') fail('Blick-Notiz Deutsch')
if (personNamedInCorrection('Schöme ist ein Mann', ['Khan', 'Schöme']) !== 'Schöme') {
  fail('Notiz nennt Schöme')
}
const contig = sceneContinuityBlock({
  placements: seatPeople,
  speaker: 'Schöme',
  addressee: 'Khan',
  genders: { Schöme: 'male', Khan: 'male', Ubai: 'male' },
  stillCorrection: 'Schöme ist ein Mann',
  hasGrundbild: true,
})
if (!contig.includes('GROUNDBILD')) fail('Kontinuität: Grundbild')
if (!contig.includes('SEATING LOCK')) fail('Kontinuität: Sitzplan')
if (!contig.includes('GAZE LOCK')) fail('Kontinuität: Blick')
if (!contig.includes('CAST LOCK')) fail('Kontinuität: wer wer ist')
if (!contig.toLowerCase().includes('male')) fail('Kontinuität: Schöme männlich')

const manAttach = stillAttachmentInstruction({
  correctingExisting: true,
  closeup: true,
  rewritePerson: true,
})
if (manAttach.toLowerCase().includes('exact people')) {
  fail('Anhang darf bei Geschlechtswechsel das Gesicht nicht sperren')
}
if (!manAttach.toLowerCase().includes('sex and face may change')) {
  fail('Anhang sagt: Gesicht darf neu sein')
}
if (!manAttach.toLowerCase().includes('cropped screenshot') && !manAttach.toLowerCase().includes('new closer')) {
  fail('Anhang: neu filmen, nicht ausschneiden')
}
if (!manAttach.toLowerCase().includes('groundbild')) {
  fail('Anhang schickt den Ort mit')
}
if (manAttach.toLowerCase().includes('first a crop') || manAttach.toLowerCase().includes('used only as a map')) {
  fail('Anhang darf keinen Pixel-Ausschnitt als erstes Foto schicken')
}
if (!manAttach.toLowerCase().includes('walked closer') && !manAttach.toLowerCase().includes('parallax')) {
  fail('Anhang: Kamera näher, neue Perspektive')
}
if (!correctionIsFaceOnly('Mund etwas offener')) fail('Mund = nur Mimik')
if (correctionIsFaceOnly('Schöme ist ein Mann')) fail('Mann ist kein Mimik-Fix')
if (correctionIsFaceOnly('Kamera näher')) fail('Kamera näher ist keine Mimik')
if (!closeupCameraLine('Ramo').toLowerCase().includes('cropped screenshot')) {
  fail('Kamera-Zeile verbietet den Ausschnitt')
}
if (!closeupCameraLine('Ramo').toLowerCase().includes('film from')) {
  fail('Kamera-Zeile: Grundbild ist Vorlage, nicht das Ergebnis')
}
const spaceLine = closeupSpaceLine({ speaker: 'Ramo', settingHint: 'Wohnzimmer', speakerX: 20 })
if (spaceLine.toLowerCase().includes('camera zoom of that gathering')) {
  fail('Raumzeile darf den Ausschnitt nicht als Kamera ausgeben')
}
if (!spaceLine.toLowerCase().includes('wide groundbild') && !spaceLine.toLowerCase().includes('wide grundbild')) {
  fail('Raumzeile: erstes Foto ist das Weit-Bild')
}
if (!spaceLine.toLowerCase().includes('parallax')) {
  fail('Raumzeile: echte Kamerabewegung, nicht Crop')
}
const closeAttach = stillAttachmentInstruction({ correctingExisting: false, closeup: true })
if (closeAttach.toLowerCase().includes('first a crop')) {
  fail('Nahaufnahme-Anhang beginnt nicht mit dem Ausschnitt')
}
if (!closeAttach.toLowerCase().includes('wide groundbild') && !closeAttach.toLowerCase().includes('wide grundbild')) {
  fail('Nahaufnahme-Anhang: zuerst das ganze Grundbild')
}
const mimicAttach = stillAttachmentInstruction({
  correctingExisting: true,
  closeup: true,
})
if (!mimicAttach.toLowerCase().includes('exact people')) {
  fail('Nur Mimik: vorhandenes Gesicht behalten')
}

const girlCu = {
  ...closePanel,
  id: 'cu-schoeme-girl',
  stillUrl: 'https://example.com/schoeme-girl.png',
  closeupSpeaker: 'Schöme',
  shot: 'closeup' as const,
}
const boardGirl = {
  ...withWide,
  panels: [...withWide.panels, girlCu],
}
if (correctFromUrlForPanel(boardGirl, girlCu, 'Schöme ist ein Mann') !== 'https://example.com/wide.png') {
  fail('Geschlecht wechseln nimmt die Übersicht, nicht das Mädchen-Porträt')
}
if (correctFromUrlForPanel(boardGirl, girlCu, 'Mund etwas offener') !== girlCu.stillUrl) {
  fail('Nur Mimik nimmt das vorhandene Nah-Bild')
}
const rewriteRefs = referenceUrlsForPanel(
  girlCu,
  undefined,
  'https://example.com/wide.png',
  'https://example.com/wide.png',
)
if (rewriteRefs[0] !== 'https://example.com/wide.png') fail('Neu malen: zuerst die Übersicht')
if (rewriteRefs.includes('https://example.com/schoeme-girl.png')) {
  fail('Neu malen hängt nicht das Mädchen-Porträt an')
}
if (sceneGrundbildPanel(boardGirl, girlCu.sceneId)?.stillUrl !== 'https://example.com/wide.png') {
  fail('Grundbild ist die Übersicht der Szene')
}
const reused = applyPanelStill(boardGirl, girlCu.id, 'https://example.com/wide.png', 'illustration-lebendig')
const swapped = replaceStillUrl(reused, 'https://example.com/wide.png', 'https://example.com/wide-boy.png', girlCu.sceneId)
if (swapped.panels.some((p) => p.stillUrl === 'https://example.com/wide.png' && p.sceneId === girlCu.sceneId)) {
  fail('Neues Grundbild ersetzt das alte in der Szene')
}
if (!swapped.panels.some((p) => p.stillUrl === 'https://example.com/wide-boy.png')) {
  fail('Neues Grundbild liegt auf den Zeilen')
}

if (panelAddressee({ ...s1[0]!, closeupSpeaker: 'Julien', lineIds: ['l1'] }, dialog) !== 'Tara') {
  fail('Gegenüber von Julien ist Tara')
}

const playQuiet = scenePlayBeats(s1, dialog)
if (playQuiet.some((b) => b.establishing)) fail('Ohne Weit-Bild keine stille Raumaufnahme')
if (playQuiet.filter((b) => !b.establishing).length !== 2) {
  fail('Abspielen: eine Takt pro Dialogzeile, nicht den ganzen Block')
}
const playWithRoom = scenePlayBeats(panelsForScene(withStill, scene1.id), dialog)
if (!playWithRoom[0]?.establishing) fail('Zuerst den Raum anschauen')
if (playWithRoom.filter((b) => !b.establishing).length !== 2) fail('dann die Zeilen nacheinander')

console.log('OK: Szene für Szene Standbilder, Dialog, Korrektur, Geschlecht, Sprache, Vorschau')
