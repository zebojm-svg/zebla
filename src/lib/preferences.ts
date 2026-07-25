const KEY_ROMANIZATION = 'zebla.includeRomanization'
const KEY_SHOW_TARGET = 'zebla.showTargetText'
const KEY_SHOW_TRANSLATION = 'zebla.showTranslation'
const KEY_CLOUD_TTS = 'zebla.useCloudTts'
const KEY_UI_LANGUAGE = 'zebla.uiLanguage'

export type UiLanguage = 'de' | 'en' | 'fr' | 'fa'

const UI_LANGUAGES: UiLanguage[] = ['de', 'en', 'fr', 'fa']

export function getIncludeRomanization(): boolean {
  const v = localStorage.getItem(KEY_ROMANIZATION)
  if (v === null) return true
  return v === '1'
}

export function setIncludeRomanization(value: boolean): void {
  localStorage.setItem(KEY_ROMANIZATION, value ? '1' : '0')
}

export function getShowTargetText(): boolean {
  const v = localStorage.getItem(KEY_SHOW_TARGET)
  if (v === null) return true
  return v === '1'
}

export function setShowTargetText(value: boolean): void {
  localStorage.setItem(KEY_SHOW_TARGET, value ? '1' : '0')
}

export function getShowTranslation(): boolean {
  const v = localStorage.getItem(KEY_SHOW_TRANSLATION)
  if (v === null) return true
  return v === '1'
}

export function setShowTranslation(value: boolean): void {
  localStorage.setItem(KEY_SHOW_TRANSLATION, value ? '1' : '0')
}

/** Standard: Cloud für Sprachen mit Gemini-TTS (fa/ko/ja/zh/ar) und Arabisch. */
export function defaultUseCloudTts(languageCode: string): boolean {
  const p = languageCode.slice(0, 2).toLowerCase()
  return p === 'fa' || p === 'ar' || p === 'ko' || p === 'ja' || p === 'zh'
}

export function getUseCloudTts(languageCode: string): boolean {
  const v = localStorage.getItem(KEY_CLOUD_TTS)
  if (v === null) return defaultUseCloudTts(languageCode)
  return v === '1'
}

export function setUseCloudTts(value: boolean): void {
  localStorage.setItem(KEY_CLOUD_TTS, value ? '1' : '0')
}

export function getShowRomanization(): boolean {
  return getIncludeRomanization()
}

export function setShowRomanization(value: boolean): void {
  setIncludeRomanization(value)
}

export function detectBrowserUiLanguage(): UiLanguage {
  if (typeof navigator === 'undefined') return 'de'
  const candidates = [navigator.language, ...(navigator.languages ?? [])]
  for (const raw of candidates) {
    const code = raw.slice(0, 2).toLowerCase()
    if (UI_LANGUAGES.includes(code as UiLanguage)) return code as UiLanguage
  }
  return 'de'
}

export function getUiLanguage(): UiLanguage {
  const v = localStorage.getItem(KEY_UI_LANGUAGE)
  if (v && UI_LANGUAGES.includes(v as UiLanguage)) return v as UiLanguage
  return detectBrowserUiLanguage()
}

export function setUiLanguage(value: UiLanguage): void {
  localStorage.setItem(KEY_UI_LANGUAGE, value)
}

export const UI_LANGUAGE_OPTIONS: { code: UiLanguage; label: string }[] = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'fa', label: 'فارسی' },
]
