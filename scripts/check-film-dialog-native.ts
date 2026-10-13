/**
 * Dialog zuerst Muttersprache, Zielsprache per Knopf (ohne echte KI).
 * Aufruf: npx tsx scripts/check-film-dialog-native.ts
 */
import { readFileSync } from 'node:fs'
import {
  applyNativeFirstDraftLine,
  applyNativeFirstDraftSections,
  applyTargetTranslationToLine,
  dialogNeedsTargetTranslation,
  lineHasTargetSpeech,
  lineStoryText,
} from '../shared/film-dialog-native.ts'
import { dialogNeedsNativeTranslation, planBoardWithoutAi } from '../shared/film-storyboard.ts'
import { lineSpeechText } from '../shared/line-speech.ts'
import type { Dialog, DialogSection } from '../shared/types.ts'

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
if (!aiSrc.includes('ALLE Regie auf Deutsch')) {
  fail('Regie bleibt Deutsch im Prompt')
}

const editorSrc = readFileSync(new URL('../src/pages/DialogEditorPage.tsx', import.meta.url), 'utf8')
if (!editorSrc.includes('Zielsprache machen')) {
  fail('Dialog-Seite hat den Knopf Zielsprache machen')
}
const boardSrc = readFileSync(new URL('../src/story/FilmStoryboardPage.tsx', import.meta.url), 'utf8')
if (!boardSrc.includes('Zielsprache machen')) {
  fail('Bilder-Seite hat den Knopf Zielsprache machen')
}

console.log('OK: Dialog zuerst Muttersprache, Zielsprache per Knopf')
