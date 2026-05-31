const KEY_ROMANIZATION = 'zebla.includeRomanization'
const KEY_CLOUD_TTS = 'zebla.useCloudTts'

export function getIncludeRomanization(): boolean {
  const v = localStorage.getItem(KEY_ROMANIZATION)
  if (v === null) return true
  return v === '1'
}

export function setIncludeRomanization(value: boolean): void {
  localStorage.setItem(KEY_ROMANIZATION, value ? '1' : '0')
}

/** Standard: Cloud für Persisch/Arabisch (Windows oft unzuverlässig), sonst Windows. */
export function defaultUseCloudTts(languageCode: string): boolean {
  const p = languageCode.slice(0, 2).toLowerCase()
  return p === 'fa' || p === 'ar'
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
