import { inferDialogLineKind, type DialogLine } from './types.js'

function normSpeech(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

const GERMAN_STAGE_RE =
  /bereitet tee|für seine gäste|hat freunde|eingeladen|eines tages|füllt wasser|stellt den kessel|klopft es an|an der spüle|wasser läuft|kessel pfeift/i
const ENGLISH_STAGE_RE =
  /once upon a time|invited friends|prepares tea|fills the kettle|knocks on the door/i

/** Deutsch/Englisch nicht über einem persischen (oder anderen) Film vorlesen. */
export function spokenTextMatchesTarget(text: string, targetLanguage?: string): boolean {
  const lang = (targetLanguage || '').slice(0, 2).toLowerCase()
  const t = normSpeech(text)
  if (!t) return false
  if (!lang || lang === 'de') return true
  const arabic = /[\u0600-\u06FF]/.test(t)
  if ((lang === 'fa' || lang === 'ar') && arabic) return true
  if (lang !== 'de' && GERMAN_STAGE_RE.test(t) && !arabic) return false
  if (lang !== 'en' && ENGLISH_STAGE_RE.test(t) && !arabic) return false
  return true
}

export function lineShouldSpeak(
  line: Pick<DialogLine, 'kind' | 'speaker' | 'text' | 'cueImage' | 'birkenbihl'>,
  targetLanguage?: string,
): boolean {
  if (inferDialogLineKind(line) === 'action') return false
  return spokenTextMatchesTarget(lineSpeechText(line) || line.text, targetLanguage)
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
