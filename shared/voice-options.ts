export interface VoiceChoice {
  name: string
  gender: 'male' | 'female'
  label: string
}

const GEMINI: VoiceChoice[] = [
  { name: 'Kore', gender: 'female', label: 'Kore (weiblich)' },
  { name: 'Aoede', gender: 'female', label: 'Aoede (weiblich)' },
  { name: 'Leda', gender: 'female', label: 'Leda (weiblich)' },
  { name: 'Charon', gender: 'male', label: 'Charon (männlich)' },
  { name: 'Puck', gender: 'male', label: 'Puck (männlich)' },
  { name: 'Fenrir', gender: 'male', label: 'Fenrir (männlich)' },
]

const CLASSIC: Record<string, VoiceChoice[]> = {
  ko: [
    { name: 'ko-KR-Neural2-A', gender: 'female', label: 'Koreanisch A (weiblich)' },
    { name: 'ko-KR-Wavenet-A', gender: 'female', label: 'Koreanisch Wavenet A' },
    { name: 'ko-KR-Neural2-C', gender: 'male', label: 'Koreanisch C (männlich)' },
    { name: 'ko-KR-Neural2-B', gender: 'male', label: 'Koreanisch B (männlich)' },
  ],
  de: [
    { name: 'de-DE-Neural2-F', gender: 'female', label: 'Deutsch F' },
    { name: 'de-DE-Neural2-D', gender: 'male', label: 'Deutsch D' },
  ],
  en: [
    { name: 'en-US-Neural2-F', gender: 'female', label: 'Englisch F' },
    { name: 'en-US-Neural2-D', gender: 'male', label: 'Englisch D' },
  ],
  ja: [
    { name: 'ja-JP-Neural2-B', gender: 'female', label: 'Japanisch B' },
    { name: 'ja-JP-Neural2-D', gender: 'male', label: 'Japanisch D' },
  ],
  fr: [
    { name: 'fr-FR-Neural2-A', gender: 'female', label: 'Französisch A' },
    { name: 'fr-FR-Neural2-B', gender: 'male', label: 'Französisch B' },
  ],
  es: [
    { name: 'es-ES-Neural2-A', gender: 'female', label: 'Spanisch A' },
    { name: 'es-ES-Neural2-B', gender: 'male', label: 'Spanisch B' },
  ],
}

export function usesGeminiVoicePicker(languageCode: string): boolean {
  return languageCode.slice(0, 2).toLowerCase() === 'fa'
}

export function voiceChoicesForLanguage(languageCode: string): VoiceChoice[] {
  const key = languageCode.slice(0, 2).toLowerCase()
  if (usesGeminiVoicePicker(languageCode)) return GEMINI
  return CLASSIC[key] ?? []
}
