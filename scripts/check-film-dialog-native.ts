/**
 * Dialog zuerst Muttersprache, Zielsprache per Knopf (ohne echte KI).
 * Aufruf: npx tsx scripts/check-film-dialog-native.ts
 */
import { readFileSync } from 'node:fs'
import {
  applyNativeFirstDraftLine,
  applyNativeFirstDraftSections,
  applyTargetTranslationToLine,
  countFilledTargetSpeech,
  dialogNeedsNativeFill,
  dialogNeedsTargetTranslation,
  lineGermanText,
  lineHasTargetSpeech,
  looksLikeGerman,
  lineNeedsNativeFill,
  lineNeedsTargetTranslation,
  lineRomanizationText,
  lineStoryText,
  lineTargetText,
  mergeTranslatedTargetLines,
  pickTargetBirkenbihlChunk,
  pickTargetTranslateChunk,
  prepareLinesForTargetTranslation,
  spokenLooksLikeSourceLanguage,
  TARGET_TRANSLATE_CHUNK,
  translateTimeoutHintDe,
  zielspracheBusyLabel,
  countRemainingTargetWork,
  lineNeedsTargetBirkenbihl,
} from '../shared/film-dialog-native.ts'
import { dialogNeedsNativeTranslation, planBoardWithoutAi } from '../shared/film-storyboard.ts'
import { lineSpeechText } from '../shared/line-speech.ts'
import type { Dialog, DialogLine, DialogSection } from '../shared/types.ts'

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

const drafted = applyNativeFirstDraftSections([
  {
    id: 's1',
    title: 'Wohnzimmer',
    lines: [
      {
        id: 'n1',
        speaker: 'Erzähler',
        kind: 'narrator',
        text: 'Ramo hat Freunde eingeladen.',
        cueImage: 'Wohnzimmer, Ramo sitzt traurig',
        cueSound: '',
        cueSpeech: 'ruhig',
      },
      {
        id: 'a1',
        speaker: 'Handlung',
        kind: 'action',
        text: 'Ramo füllt Wasser in den Kessel.',
        cueImage: 'Kamera auf Augenhöhe, nicht die Füsse',
        cueSound: 'Wasser läuft in den Kessel',
      },
      {
        id: 'sp1',
        speaker: 'Ramo',
        kind: 'speech',
        text: 'Willkommen, Khan.',
        cueImage: 'Nahaufnahme Ramo',
        cueSpeech: 'freundlich',
      },
    ],
  },
])

const narrator = drafted[0]!.lines.find((l) => l.id === 'n1')!
const action = drafted[0]!.lines.find((l) => l.id === 'a1')!
const speech = drafted[0]!.lines.find((l) => l.id === 'sp1')!
if (narrator.text.trim()) fail('Erzähler: Zielsprache leer bis zum Knopf')
if (narrator.nativeText !== 'Ramo hat Freunde eingeladen.') {
  fail('Erzähler steht in der Muttersprache')
}
if (narrator.cueImage !== 'Wohnzimmer, Ramo sitzt traurig') fail('Regie Bild bleibt Deutsch')
if (narrator.cueSpeech !== 'ruhig') fail('Regie Sprache bleibt Deutsch')
if (action.text !== 'Ramo füllt Wasser in den Kessel.') fail('Handlung bleibt Deutsch im Text')
if (action.cueImage !== 'Kamera auf Augenhöhe, nicht die Füsse') fail('Handlung-Regie bleibt Deutsch')
if (speech.text.trim()) fail('Dialog: Zielsprache leer bis zum Knopf')
if (speech.nativeText !== 'Willkommen, Khan.') fail('Dialog steht in der Muttersprache')
if (speech.cueImage !== 'Nahaufnahme Ramo') fail('Dialog-Regie bleibt Deutsch')

const nativeDialog: Dialog = {
  id: 'd-native',
  userId: 'u1',
  title: 'Einladung',
  sourceLanguage: 'de',
  targetLanguage: 'fa',
  length: 'short',
  sections: drafted,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}
if (!dialogNeedsTargetTranslation(nativeDialog)) fail('ohne Zielsprache fehlt der Knopf')
if (dialogNeedsNativeTranslation(nativeDialog)) fail('Muttersprache ist schon da')
if (lineHasTargetSpeech(speech)) fail('gesprochene Zielsprache noch nicht da')
if (lineSpeechText(speech)) fail('TTS schweigt, solange die Zielsprache fehlt')
if (lineSpeechText(action)) fail('Handlung wird nicht vorgelesen')
if (lineStoryText(speech) !== 'Willkommen, Khan.') fail('Board liest den deutschen Dialog')

const board = planBoardWithoutAi(nativeDialog, [])
if (!board.panels.some((p) => p.caption.includes('Willkommen'))) {
  fail('Planen ohne KI nimmt den deutschen Dialog als Bildtitel')
}

const filled = applyTargetTranslationToLine(speech, 'خوش آمدید، خان', [
  { text: 'خوش', translation: 'willkommen', romanization: 'khosh' },
  { text: 'آمدید', translation: 'ihr-kamt' },
])
if (filled.text !== 'خوش آمدید، خان') fail('Knopf füllt die Zielsprache')
if (filled.nativeText !== 'Willkommen, Khan.') fail('Deutsch bleibt nach dem Übersetzen')
if (filled.cueImage !== 'Nahaufnahme Ramo') fail('Regie bleibt Deutsch nach dem Übersetzen')
if (!filled.birkenbihl?.some((w) => w.romanization === 'khosh')) {
  fail('optional Birkenbihl/Lautschrift nach dem Knopf')
}
if (!lineHasTargetSpeech(filled)) fail('nach dem Knopf gibt es Zielsprache')
if (!lineSpeechText(filled).includes('خوش')) fail('TTS spricht die Zielsprache nach dem Knopf')

const filledNarrator = applyTargetTranslationToLine(narrator, 'رامو دوستان را دعوت کرده')
const translatedDialog: Dialog = {
  ...nativeDialog,
  sections: [
    {
      ...drafted[0]!,
      lines: drafted[0]!.lines.map((l) => {
        if (l.id === 'sp1') return filled
        if (l.id === 'n1') return filledNarrator
        return l
      }),
    },
  ],
}
if (dialogNeedsTargetTranslation(translatedDialog)) {
  fail('mit Zielsprache auf allen Sprechzeilen ist der Knopf nicht mehr nötig')
}

const fromEmpty = applyNativeFirstDraftLine({
  id: 'x',
  speaker: 'Ramo',
  kind: 'speech',
  text: '',
  nativeText: 'Khan, setz dich.',
  cueImage: 'Ramo zeigt auf das Kissen',
})
if (fromEmpty.text) fail('leere Zielsprache bleibt leer')
if (fromEmpty.nativeText !== 'Khan, setz dich.') fail('vorhandenes Deutsch behalten')

const extra: DialogSection[] = applyNativeFirstDraftSections([
  {
    id: 's2',
    title: 'Küche',
    lines: [
      {
        id: 'k1',
        speaker: 'Ramo',
        kind: 'speech',
        nativeText: 'Der Tee ist fertig.',
        text: '',
        cueImage: 'Küche, Augenhöhe',
      },
    ],
  },
])
if (extra[0]!.lines[0]!.nativeText !== 'Der Tee ist fertig.') {
  fail('schon deutsche nativeText nicht überschreiben')
}

const aiSrc = readFileSync(new URL('../lib/ai.ts', import.meta.url), 'utf8')
if (!aiSrc.includes('Noch KEINE Zielsprache')) {
  fail('Dialog daraus machen schreibt keine Zielsprache')
}
if (!aiSrc.includes('applyNativeFirstDraftSections')) {
  fail('Entwurf legt den gesprochenen Text in die Muttersprache')
}
if (!aiSrc.includes('translateNativeDialogToTarget')) {
  fail('Es gibt einen Übersetzer Muttersprache → Zielsprache')
}
const nativeFn = aiSrc.split('export async function translateNativeDialogToTarget')[1]?.split(
  'export async function',
)[0]
if (!nativeFn?.includes('prepareLinesForTargetTranslation')) {
  fail('Übersetzer sichert Deutsch bevor die Zielsprache kommt')
}
if (!nativeFn?.includes('mergeTranslatedTargetLines')) {
  fail('Übersetzer schreibt die Zielsprache nach text, nicht nach nativeText')
}
if (!nativeFn?.includes('applyBirkenbihlDialog')) {
  fail('Birkenbihl nach der Zielsprache in Paketen, nicht in einem Rutsch')
}
if (!/catch\s*\{[\s\S]*return merged/.test(nativeFn ?? '')) {
  fail('Zielsprache bleibt gespeichert, auch wenn Birkenbihl scheitert')
}
if (!aiSrc.includes('l.nativeText || l.text')) {
  fail('Übersetzer liest Deutsch aus nativeText oder text')
}
if (!aiSrc.includes('languageName(targetLanguage)')) {
  fail('Übersetzer sagt Persisch/Dari, nicht nur fa')
}
if (!aiSrc.includes('row?.nativeText')) {
  fail('Birkenbihl stürzt nicht ab wenn die KI eine Zeile auslässt')
}
if (!aiSrc.includes('ALLE Regie auf Deutsch')) {
  fail('Regie bleibt Deutsch im Prompt')
}

const editorSrc = readFileSync(new URL('../src/pages/DialogEditorPage.tsx', import.meta.url), 'utf8')
if (!editorSrc.includes('Zielsprache machen')) {
  fail('Dialog-Seite hat den Knopf Zielsprache machen')
}
if (editorSrc.includes('disabled={!!busy || !dialogNeedsTargetTranslation')) {
  fail('linker Knopf Zielsprache machen darf nicht stumm disabled sein — sonst passiert beim Klick nichts')
}
if (!editorSrc.includes('Zielsprache läuft')) {
  fail('Knopf zeigt «Zielsprache läuft …», nicht stilles Warten')
}
if (!editorSrc.includes('applyTranslateResult')) {
  fail('Dialog-Seite zeigt Fehler oder Zeilenzahl nach Zielsprache machen')
}
if (!editorSrc.includes('dialog-target-feedback')) {
  fail('Fehler und Ergebnis stehen neben dem Knopf, nicht nur oben auf der Seite')
}
if (!editorSrc.includes('Deutsch unter die Zeilen')) {
  fail('Dialog-Seite hat den Knopf Deutsch unter die Zeilen für alte Filme')
}
if (!editorSrc.includes('LineLanguageLayers')) {
  fail('Dialog-Seite zeigt die drei Sprachschichten getrennt')
}
if (editorSrc.includes('BirkenbihlLine')) {
  fail('Dialog-Seite darf Deutsch nicht in der Birkenbihl-Zeile verstecken')
}
if (!editorSrc.includes('includeRomanization')) {
  fail('Dialog-Seite schickt Lautschrift mit an Zielsprache machen')
}
if (!editorSrc.includes('translateTargetUntilDone')) {
  fail('Dialog-Seite macht Zielsprache in Runden, nicht in einem Rutsch')
}
if (!editorSrc.includes('noch ${remainingLines} Zeilen') && !editorSrc.includes('zielspracheBusyLabel')) {
  fail('Knopf zeigt «noch X Zeilen» während die Runden laufen')
}
if (!editorSrc.includes('translateTimeoutHintDe')) {
  fail('Dialog-Seite erklärt Zeitlimit: fertige Zeilen bleiben')
}
const boardSrc = readFileSync(new URL('../src/story/FilmStoryboardPage.tsx', import.meta.url), 'utf8')
if (boardSrc.includes('Zielsprache machen')) {
  fail('Bilder-Seite hat keinen Knopf Zielsprache machen — das bleibt unter Text')
}
if (boardSrc.includes('translateTargetUntilDone')) {
  fail('Bilder-Seite übersetzt nicht — Zielsprache bleibt unter Text')
}
if (!boardSrc.includes('Zielsprache machst du unter Text')) {
  fail('fehlende Zielsprache: Hinweis auf Text, kein zweiter Knopf')
}
if (!boardSrc.includes('Deutsch unter die Zeilen')) {
  fail('Bilder-Seite hat den Knopf Deutsch unter die Zeilen für alte Filme')
}
if (!boardSrc.includes('Bilder planen')) {
  fail('Bilder-Seite hat einen Knopf Bilder planen')
}
if (boardSrc.includes('Storyboard erzeugen')) {
  fail('Storyboard erzeugen ist derselbe Job wie Bilder planen — nur ein Knopf')
}
if (boardSrc.includes("'Planen'") || boardSrc.includes('"Planen"') || boardSrc.includes('>Planen<')) {
  fail('kein zweiter Knopf Planen — Bilder planen reicht')
}
if (!boardSrc.includes('Deutsch reicht')) {
  fail('Leerzustand: Deutsch reicht für den Bildplan, ohne Persisch')
}
if (boardSrc.includes('erst dann spricht')) {
  fail('Bilder-Seite verlangt nicht Zielsprache vor dem Bildplan')
}
if (!boardSrc.includes('{board ? (')) {
  fail('Bilder planen oben nur wenn schon ein Plan da ist — Leerzustand hat denselben Knopf')
}
const emptyBlock = boardSrc.split('empty-state')[1]?.split(')}')[0] ?? ''
if (!emptyBlock.includes('btn-primary')) fail('Leerzustand: ein grüner Knopf')
if ((emptyBlock.match(/btn-primary/g) || []).length !== 1) {
  fail('Leerzustand: nur ein grüner Knopf')
}
if (emptyBlock.includes('Zielsprache machen')) {
  fail('Leerzustand mischt Zielsprache nicht in die Bilder')
}
if (editorSrc.includes('dann Bilder → Vom Text neu')) {
  fail('Dialog daraus machen verlangt nicht Zielsprache vor den Bildern')
}
if (!editorSrc.includes('Bilder planen') || !editorSrc.includes('Deutsch reicht')) {
  fail('nach Dialog daraus machen: Bilder ohne Zielsprache')
}
const layersSrc = readFileSync(
  new URL('../src/components/LineLanguageLayers.tsx', import.meta.url),
  'utf8',
)
if (layersSrc.includes('(normale Sprache)')) {
  fail('Schild heißt Deutsch, nicht «normale Sprache»')
}
if (layersSrc.includes('Zielsprache (')) fail('Schild heißt Zielsprache, Sprache steht im Text')
if (!/return 'Deutsch'\s*$/m.test(layersSrc)) fail('Deutsch-Schicht hat ein eigenes Schild')
if (!/return 'Zielsprache'\s*$/m.test(layersSrc)) fail('Zielsprache hat ein eigenes Schild')
if (!layersSrc.includes('>Birkenbihl<')) fail('Birkenbihl hat ein eigenes Schild')
if (!layersSrc.includes('>Lautschrift<')) fail('Lautschrift hat ein eigenes Schild')
const beatSrc = readFileSync(new URL('../src/story/FilmSceneGenerate.tsx', import.meta.url), 'utf8')
if (!beatSrc.includes('LineLanguageLayers')) {
  fail('Board-Comic-Zeile zeigt die drei Sprachschichten')
}
if (beatSrc.includes('Vom Text neu')) {
  fail('Szene-Hinweis sagt Bilder planen, nicht Vom Text neu')
}
if (!beatSrc.includes('Bilder planen')) {
  fail('Szene-Hinweis zeigt auf Bilder planen')
}
if (beatSrc.includes('Zielsprache machen')) {
  fail('Comic-Zeile hat keinen Knopf Zielsprache machen — das bleibt unter Text')
}
if (!beatSrc.includes('Zielsprache machst du unter Text')) {
  fail('Comic-Zeile: fehlende Zielsprache verweist auf Text')
}
const previewSrc = readFileSync(new URL('../src/story/FilmScenePreview.tsx', import.meta.url), 'utf8')
if (previewSrc.includes('Zielsprache machen')) {
  fail('Szene-Abspielen hat keinen Knopf Zielsprache machen — das bleibt unter Text')
}
if (!previewSrc.includes('Zielsprache machst du unter Text')) {
  fail('Szene-Abspielen: fehlende Zielsprache verweist auf Text')
}
if (!editorSrc.includes('id="ki-werkzeuge"') || !editorSrc.includes('Zielsprache machen')) {
  fail('Zielsprache machen bleibt unter Text bei den KI-Werkzeugen')
}

const oldTargetFirst = {
  id: 'old',
  speaker: 'Ramo',
  kind: 'speech' as const,
  text: 'خوش آمدید',
  birkenbihl: [
    { text: 'خوش', translation: 'willkommen' },
    { text: 'آمدید', translation: 'ihr-kamt' },
  ],
}
if (lineGermanText(oldTargetFirst)) {
  fail('German slot darf die Birkenbihl-Wörter nicht als Deutsch zeigen')
}
if (lineGermanText(oldTargetFirst) === 'willkommen ihr-kamt') {
  fail('Birkenbihl-Wortsalat gehört nicht ins Deutsche')
}
if (lineTargetText(oldTargetFirst) !== 'خوش آمدید') fail('Persisch bleibt die Zielsprache')
if (
  lineGermanText({ ...oldTargetFirst, nativeText: 'Willkommen.' }) !== 'Willkommen.'
) {
  fail('gespeichertes Deutsch ohne neuen Film zeigen')
}
if (!lineNeedsNativeFill(oldTargetFirst)) {
  fail('ohne Deutsch braucht der alte Film Deutsch unter die Zeilen')
}
if (
  lineNeedsNativeFill({
    ...oldTargetFirst,
    nativeText: 'Willkommen.',
    birkenbihl: [{ text: 'خوش', translation: 'willkommen', romanization: 'khosh' }],
  })
) {
  fail('mit Deutsch und Birkenbihl ist Deutsch unter die Zeilen nicht nötig')
}
if (
  !lineNeedsNativeFill({
    ...oldTargetFirst,
    nativeText: 'Willkommen.',
    birkenbihl: undefined,
  })
) {
  fail('mit Deutsch aber ohne Birkenbihl fehlt die dritte Schicht')
}
if (lineRomanizationText(filled) !== 'khosh') fail('Lautschrift getrennt aus den Wörtern')

const germanInBoth: DialogLine = {
  id: 'both',
  speaker: 'Ramo',
  kind: 'speech',
  text: 'Willkommen, Khan.',
  nativeText: 'Willkommen, Khan.',
  cueImage: 'Nahaufnahme Ramo',
  imageUrl: 'https://img/still.png',
}
if (!lineNeedsTargetTranslation(germanInBoth, 'fa')) {
  fail('Deutsch in text und nativeText: Zielsprache fehlt noch')
}
const leftoverDialog: Dialog = {
  ...nativeDialog,
  sections: [{ id: 's-both', title: 'Wohnzimmer', lines: [germanInBoth] }],
}
if (!dialogNeedsTargetTranslation(leftoverDialog)) {
  fail('Knopf Zielsprache machen trotz Deutsch in text')
}

const germanOnlyInText = {
  id: 'latin',
  speaker: 'Ramo',
  kind: 'speech' as const,
  text: 'Setz dich bitte.',
  cueImage: 'Ramo zeigt auf das Kissen',
}
if (!looksLikeGerman('Setz dich bitte.')) fail('setz dich bitte ist Deutsch')
if (!looksLikeGerman('Ramo hat Freunde eingeladen.')) fail('Erzähler-Satz ist Deutsch')
if (looksLikeGerman('خوش آمدید')) fail('Persisch ist kein Deutsch')
if (!spokenLooksLikeSourceLanguage('Willkommen, Khan.', 'de', 'fa')) {
  fail('Deutsch in text gilt als Muttersprache, nicht als Ziel')
}
if (!lineNeedsTargetTranslation(germanOnlyInText, 'fa', 'de')) {
  fail('lateinischer Text bei Persisch ist noch Deutsch, nicht die Zielsprache')
}
if (!lineNeedsTargetTranslation(germanOnlyInText, 'en', 'de')) {
  fail('Deutsch in text bei Englisch als Ziel muss übersetzt werden')
}
if (lineGermanText(germanOnlyInText, 'fa', 'de') !== 'Setz dich bitte.') {
  fail('Deutsch in text erscheint in der Deutsch-Zeile, nicht in der Zielsprache')
}
if (lineTargetText(germanOnlyInText, 'fa', 'de')) {
  fail('Deutsch in text ist keine Zielsprache — Zeile bleibt leer bis zum Knopf')
}
if (lineSpeechText(germanOnlyInText, 'fa', 'de')) {
  fail('TTS schweigt, solange Deutsch noch in text steht')
}
if (lineNeedsTargetTranslation(oldTargetFirst, 'fa')) {
  fail('alter Film mit Persisch braucht nicht Zielsprache machen')
}

const narratorGermanInText: DialogLine = {
  id: 'erz',
  speaker: 'Erzähler',
  kind: 'narrator',
  text: 'Ramo hat Freunde eingeladen.',
  cueImage: 'Wohnzimmer',
}
if (!lineNeedsTargetTranslation(narratorGermanInText, 'fa', 'de')) {
  fail('Erzähler mit Deutsch in text braucht Zielsprache machen')
}
if (lineGermanText(narratorGermanInText, 'fa', 'de') !== 'Ramo hat Freunde eingeladen.') {
  fail('Erzähler-Deutsch in text steht in der Deutsch-Zeile')
}
if (lineTargetText(narratorGermanInText, 'fa', 'de')) {
  fail('Erzähler-Zielsprache bleibt leer solange nur Deutsch in text steht')
}

const emptyMerge = mergeTranslatedTargetLines(
  prepareLinesForTargetTranslation([narratorGermanInText], 'fa', 'de'),
  [{ text: '' }, { text: 'Ramo hat Freunde eingeladen.' }],
  'fa',
  'de',
)
if (countFilledTargetSpeech(emptyMerge, 'fa', 'de') !== 0) {
  fail('leere oder deutsche KI-Antwort darf nicht als Zielsprache zählen')
}
if (emptyMerge[0]!.nativeText !== 'Ramo hat Freunde eingeladen.') {
  fail('bei leerer KI bleibt Deutsch in nativeText')
}
if (emptyMerge[0]!.text.trim()) fail('bei leerer KI bleibt die Zielsprache leer')

const directMerge = mergeTranslatedTargetLines(
  [narratorGermanInText],
  [{ text: 'رامو دوستان را دعوت کرده' }],
  'fa',
  'de',
)
if (directMerge[0]!.text !== 'رامو دوستان را دعوت کرده') {
  fail('ohne Vorbereitung: Zielsprache nach text, Deutsch war nur in text')
}
if (directMerge[0]!.nativeText !== 'Ramo hat Freunde eingeladen.') {
  fail('ohne Vorbereitung: Deutsch aus text nach nativeText')
}

const prepared = prepareLinesForTargetTranslation([
  speech,
  action,
  germanInBoth,
  {
    ...germanOnlyInText,
    imageUrl: 'https://img/seat.png',
    cueSound: '',
    cueSpeech: 'freundlich',
  },
])
const prepSpeech = prepared.find((l) => l.id === 'sp1')!
const prepAction = prepared.find((l) => l.id === 'a1')!
const prepBoth = prepared.find((l) => l.id === 'both')!
const prepLatin = prepared.find((l) => l.id === 'latin')!
if (prepSpeech.text.trim()) fail('Vorbereitung: Zielsprache-Slot leer')
if (prepSpeech.nativeText !== 'Willkommen, Khan.') fail('Vorbereitung: Deutsch in nativeText')
if (prepSpeech.cueImage !== 'Nahaufnahme Ramo') fail('Vorbereitung: Regie bleibt')
if (prepAction.text !== 'Ramo füllt Wasser in den Kessel.') fail('Vorbereitung: Handlung bleibt Deutsch')
if (prepBoth.nativeText !== 'Willkommen, Khan.') fail('Vorbereitung: Deutsch aus beiden Feldern behalten')
if (prepBoth.text.trim()) fail('Vorbereitung: doppeltes Deutsch nicht als Ziel lassen')
if (prepBoth.imageUrl !== 'https://img/still.png') fail('Vorbereitung: Standbild bleibt')
if (prepLatin.nativeText !== 'Setz dich bitte.') fail('Vorbereitung: Deutsch aus text holen')
if (prepLatin.text.trim()) fail('Vorbereitung: lateinischen Text nicht als Persisch behalten')

const merged = mergeTranslatedTargetLines(prepared, [
  { text: 'خوش آمدید، خان' },
  { text: 'خوش آمدید، خان' },
  { text: 'بشین لطفاً' },
])
const mSpeech = merged.find((l) => l.id === 'sp1')!
const mAction = merged.find((l) => l.id === 'a1')!
const mBoth = merged.find((l) => l.id === 'both')!
const mLatin = merged.find((l) => l.id === 'latin')!
if (mSpeech.text !== 'خوش آمدید، خان') fail('Merge schreibt die Zielsprache nach text')
if (mSpeech.nativeText !== 'Willkommen, Khan.') fail('Merge lässt Deutsch in nativeText')
if (mSpeech.cueImage !== 'Nahaufnahme Ramo') fail('Merge lässt Bild-Regie auf Deutsch')
if (mAction.text !== 'Ramo füllt Wasser in den Kessel.') fail('Merge übersetzt Handlung nicht')
if (mBoth.text !== 'خوش آمدید، خان') fail('Merge füllt Zielsprache trotz Deutsch in text')
if (mBoth.nativeText !== 'Willkommen, Khan.') fail('Merge wischt Deutsch nicht weg')
if (mBoth.imageUrl !== 'https://img/still.png') fail('Merge lässt das Standbild')
if (mLatin.text !== 'بشین لطفاً') fail('Merge füllt Zielsprache aus deutschem text')
if (mLatin.nativeText !== 'Setz dich bitte.') fail('Merge legt Deutsch nach nativeText')
if (mLatin.cueImage !== 'Ramo zeigt auf das Kissen') fail('Merge lässt Regie')

const oldDialog: Dialog = {
  ...nativeDialog,
  sections: [
    {
      id: 'old-s',
      title: 'Wohnzimmer',
      lines: [oldTargetFirst],
    },
  ],
}
if (!dialogNeedsNativeFill(oldDialog)) fail('alter Film ohne Deutsch: Knopf Deutsch unter die Zeilen')
if (dialogNeedsNativeFill(nativeDialog)) fail('neuer Film auf Deutsch: kein Deutsch unter die Zeilen')

const handlersSrc = readFileSync(new URL('../lib/ai-handlers.ts', import.meta.url), 'utf8')
const birkenFn = handlersSrc.split('export async function handleBirkenbihl')[1]?.split(
  'export async function',
)[0]
if (!birkenFn) fail('Deutsch unter die Zeilen geht über handleBirkenbihl')
if (birkenFn.includes('filmStoryboard')) {
  fail('Deutsch unter die Zeilen darf den Bildplan nicht löschen')
}
const translateFn = handlersSrc.split('export async function handleTranslate')[1]?.split(
  'export async function',
)[0]
if (!translateFn) fail('Zielsprache machen geht über handleTranslate')
if (!translateFn.includes('fromNative')) fail('Knopf schickt fromNative')
if (!translateFn.includes('translateNativeDialogToTarget')) {
  fail('API übersetzt Muttersprache → Zielsprache, nicht umgekehrt')
}
if (translateFn.includes('filmStoryboard')) {
  fail('Zielsprache machen darf den Bildplan nicht löschen')
}
if (translateFn.includes('fillFromNative && !needsTarget')) {
  fail('fromNative darf nicht stumm no-open wenn der Detektor Deutsch in text übersieht')
}
if (!translateFn.includes('translatedCount')) {
  fail('API sagt, wie viele Zeilen übersetzt wurden')
}
if (!translateFn.includes('remainingCount')) {
  fail('API sagt, wie viele Zeilen noch fehlen')
}
if (!translateFn.includes('pickTargetTranslateChunk')) {
  fail('API übersetzt nur ein Paket pro Aufruf')
}
if (!translateFn.includes('skipBirkenbihl')) {
  fail('API speichert die Zielsprache vor Birkenbihl, damit ein Zeitlimit nicht bei null beginnt')
}
if (!translateFn.includes('Keine Zeile wurde ins')) {
  fail('0 übersetzte Zeilen sind ein Fehler, kein stilles Erfolg')
}
if (!nativeFn?.includes('Kein deutscher Satz zum Übersetzen')) {
  fail('Übersetzer wirft, statt 0 Zeilen still zurückzugeben')
}
const clientSrc = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8')
if (!clientSrc.includes('fromNative')) fail('Client schickt fromNative')
if (!clientSrc.includes('includeRomanization')) {
  fail('Client kann Lautschrift mitbestellen')
}
if (!clientSrc.includes('translatedCount')) fail('Client liest die Zeilenzahl')
if (!clientSrc.includes('remainingCount')) fail('Client liest die restlichen Zeilen')
if (!clientSrc.includes('FUNCTION_INVOCATION_FAILED')) {
  fail('Vercel-Absturz FUNCTION_INVOCATION_FAILED muss als Fehler erscheinen, nicht als leere Antwort')
}

if (TARGET_TRANSLATE_CHUNK !== 8) fail('Paketgrösse ist ~8 Zeilen')
if (zielspracheBusyLabel(null) !== 'Zielsprache läuft …') fail('Knopf startet mit läuft')
if (zielspracheBusyLabel(5) !== 'noch 5 Zeilen') fail('Knopf zeigt noch X Zeilen')
const timeoutHint = translateTimeoutHintDe(
  'Zeitlimit. Bitte noch einmal «Zielsprache machen» drücken — wir warten bis zu zwei Minuten.',
)
if (!timeoutHint.includes('fertigen Zeilen bleiben')) {
  fail('Timeout-Text: fertige Zeilen bleiben')
}
if (!timeoutHint.includes('fehlenden Zeilen')) {
  fail('Timeout-Text: nur die fehlenden Zeilen')
}

const manyLines: DialogLine[] = Array.from({ length: 12 }, (_, i) => ({
  id: `m${i}`,
  speaker: i % 3 === 0 ? 'Ramo' : i % 3 === 1 ? 'Khan' : 'Ubai',
  kind: 'speech' as const,
  nativeText: `Satz ${i + 1} auf Deutsch.`,
  text: '',
  cueImage: 'Wohnzimmer',
}))
const manyDialog: Dialog = {
  ...nativeDialog,
  sections: [{ id: 's-many', title: 'Wohnzimmer', lines: manyLines }],
}
const firstChunk = pickTargetTranslateChunk(manyDialog.sections, 'fa', 'de')
if (firstChunk.length !== 8) fail('ein Abschnitt mit 12 Zeilen: erstes Paket 8')
const afterFirst = manyDialog.sections[0]!.lines.map((l, i) =>
  i < 8 ? applyTargetTranslationToLine(l, `هدف ${i}`) : l,
)
const afterFirstDialog: Dialog = {
  ...manyDialog,
  sections: [{ ...manyDialog.sections[0]!, lines: afterFirst }],
}
if (countRemainingTargetWork(afterFirstDialog) !== 12) {
  fail('nach dem ersten Paket: 4 ohne Ziel + 8 ohne Birkenbihl')
}
if (pickTargetTranslateChunk(afterFirstDialog.sections, 'fa', 'de').length !== 4) {
  fail('zweites Paket nimmt nur die fehlenden 4')
}
if (lineNeedsTargetBirkenbihl(afterFirst[0]!, 'fa', 'de') !== true) {
  fail('übersetzte Zeile ohne Birkenbihl: nächste Runde füllt Birkenbihl')
}
const withBi = afterFirst.map((l, i) =>
  i < 8
    ? { ...l, birkenbihl: [{ text: 'هدف', translation: 'Satz' }] }
    : l,
)
const biDialog: Dialog = {
  ...afterFirstDialog,
  sections: [{ ...afterFirstDialog.sections[0]!, lines: withBi }],
}
if (pickTargetBirkenbihlChunk(biDialog.sections, 'fa', 'de').length !== 0) {
  fail('mit Birkenbihl kein zweites Birkenbihl-Paket')
}
if (countRemainingTargetWork(biDialog) !== 4) fail('Birkenbihl fertig, 4 Zielzeilen offen')

const twoSecs: DialogSection[] = [
  {
    id: 'sa',
    title: 'Wohnzimmer',
    lines: manyLines.slice(0, 3),
  },
  {
    id: 'sb',
    title: 'Küche',
    lines: manyLines.slice(3),
  },
]
const sectionChunk = pickTargetTranslateChunk(twoSecs, 'fa', 'de')
if (sectionChunk.length !== 3) fail('kleiner Abschnitt: ein Paket = der Abschnitt, nicht 8 aus der nächsten Szene')
if (sectionChunk.some((l) => l.id.startsWith('m') && Number(l.id.slice(1)) >= 3)) {
  fail('Paket bleibt im ersten Abschnitt')
}

const loopSrc = readFileSync(new URL('../src/lib/translateTarget.ts', import.meta.url), 'utf8')
if (!loopSrc.includes('remainingCount')) fail('Client-Schleife liest remainingCount')
if (!loopSrc.includes('MAX_ROUNDS')) fail('Client-Schleife hat ein Limit, kein Endlos-Drehen')

console.log('OK: Dialog zuerst Muttersprache, Zielsprache per Knopf')
