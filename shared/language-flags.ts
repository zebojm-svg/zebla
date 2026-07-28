import { LANGUAGES, languageName } from './types'

/** ISO-ähnliche Sprachcodes → Flaggen-Emoji (Fallback: 🏳️). */
const FLAGS: Record<string, string> = {
  de: '🇩🇪',
  en: '🇬🇧',
  fr: '🇫🇷',
  es: '🇪🇸',
  it: '🇮🇹',
  pt: '🇵🇹',
  nl: '🇳🇱',
  pl: '🇵🇱',
  tr: '🇹🇷',
  ja: '🇯🇵',
  zh: '🇨🇳',
  ar: '🇸🇦',
  fa: '🇦🇫', // Dari/Persisch – Afghanistan-Flagge für Dari-Kontext
  ru: '🇷🇺',
  sv: '🇸🇪',
  da: '🇩🇰',
  no: '🇳🇴',
  el: '🇬🇷',
  cs: '🇨🇿',
  hu: '🇭🇺',
  ko: '🇰🇷',
}

export function languageFlag(code: string): string {
  const key = code.slice(0, 2).toLowerCase()
  return FLAGS[key] ?? '🏳️'
}

/** Stabiler Schlüssel für spätere Matrix source×target. */
export function languagePairKey(sourceLanguage: string, targetLanguage: string): string {
  return `${sourceLanguage.slice(0, 2).toLowerCase()}→${targetLanguage.slice(0, 2).toLowerCase()}`
}

export function languagePairLabel(sourceLanguage: string, targetLanguage: string): string {
  return `${languageName(sourceLanguage)} → ${languageName(targetLanguage)}`
}

export function knownLanguageCodes(): string[] {
  return LANGUAGES.map((l) => l.code)
}
