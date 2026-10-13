import { inferDialogLineKind, type DialogLine } from './types.js'
import { lineTargetText } from './film-dialog-native.js'

function normSpeech(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** Text für Sprachausgabe: nur Zielsprache, und erst nach «Zielsprache machen». */
export function lineSpeechText(
  line: Pick<DialogLine, 'text' | 'nativeText' | 'birkenbihl' | 'kind' | 'speaker' | 'cueImage'>,
  targetLanguage?: string,
  sourceLanguage?: string,
): string {
  if (inferDialogLineKind(line) === 'action') return ''
  const target = lineTargetText(line, targetLanguage, sourceLanguage)
  if (!target) return ''
  if (line.birkenbihl?.length) {
    const fromWords = line.birkenbihl
      .map((w) => w.text.trim())
      .filter(Boolean)
      .join(' ')
    if (fromWords) return fromWords
  }
  return target
}

/** Gespeichertes Audio passt nicht mehr zur angezeigten Zielsprache. */
export function speechTextDiffersFromLineText(line: DialogLine): boolean {
  if (!line.birkenbihl?.length) return false
  return normSpeech(lineSpeechText(line)) !== normSpeech(line.text)
}
