import type { DialogLine } from './types.js'

function normSpeech(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** Text für Sprachausgabe: Zielsprache aus Birkenbihl, sonst Zeilentext. */
export function lineSpeechText(line: Pick<DialogLine, 'text' | 'birkenbihl'>): string {
  if (line.birkenbihl?.length) {
    const fromWords = line.birkenbihl
      .map((w) => w.text.trim())
      .filter(Boolean)
      .join(' ')
    if (fromWords) return fromWords
  }
  return line.text.trim()
}

/** Gespeichertes Audio passt nicht mehr zur angezeigten Zielsprache. */
export function speechTextDiffersFromLineText(line: DialogLine): boolean {
  if (!line.birkenbihl?.length) return false
  return normSpeech(lineSpeechText(line)) !== normSpeech(line.text)
}
