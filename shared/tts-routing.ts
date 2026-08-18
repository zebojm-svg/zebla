/** Sprachen, für die Gemini-TTS (statt Neural2/Wavenet) genutzt wird. */
export const GEMINI_TTS_LANGS = new Set([
  'fa', // Persisch / Dari – keine klassischen Stimmen
  'ko', // Koreanisch – Gemini klingt deutlich natürlicher
  'ja',
  'zh',
  'ar',
])

export function langKey(languageCode: string): string {
  return languageCode.slice(0, 2).toLowerCase()
}

export function usesGeminiTts(languageCode: string): boolean {
  return GEMINI_TTS_LANGS.has(langKey(languageCode))
}

/** Locale-Codes für Gemini-TTS (kleingeschrieben). */
export function geminiTtsLocale(languageCode: string): string {
  const key = langKey(languageCode)
  const map: Record<string, string> = {
    fa: 'fa-ir',
    ko: 'ko-kr',
    ja: 'ja-jp',
    zh: 'cmn-cn',
    ar: 'ar-eg',
    de: 'de-de',
    en: 'en-us',
    fr: 'fr-fr',
    es: 'es-es',
    it: 'it-it',
    pt: 'pt-br',
    ru: 'ru-ru',
  }
  if (map[key]) return map[key]
  if (languageCode.includes('-')) return languageCode.toLowerCase()
  return `${key}-${key}`
}

export const GEMINI_TTS_VOICE_NAMES = {
  female: ['Kore', 'Aoede', 'Leda'] as const,
  male: ['Charon', 'Puck', 'Fenrir'] as const,
}

export function isGeminiTtsVoiceName(name: string | undefined): boolean {
  if (!name) return false
  const short = name.includes('/') ? name.split('/').pop()! : name
  return (
    (GEMINI_TTS_VOICE_NAMES.female as readonly string[]).includes(short) ||
    (GEMINI_TTS_VOICE_NAMES.male as readonly string[]).includes(short)
  )
}
