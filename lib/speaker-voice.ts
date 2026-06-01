import type { CharacterVisual } from '../shared/types.js'
import { guessSpeakerGenderFromName } from './speaker-gender.js'

export function resolveSpeakerGender(
  speaker: string,
  speakerIndex: number,
  characterBible?: CharacterVisual[],
): 'male' | 'female' {
  const fromBible = characterBible?.find((c) => c.name === speaker)?.gender
  if (fromBible === 'male' || fromBible === 'female') return fromBible
  return guessSpeakerGenderFromName(speaker, speakerIndex)
}

/** Gemini-TTS-Stimmen – mehrere pro Geschlecht für unterscheidbare Sprecher. */
const GEMINI_VOICES = {
  female: ['Kore', 'Aoede', 'Leda'],
  male: ['Charon', 'Puck', 'Fenrir'],
} as const

/** Klassische Cloud-TTS – Fallback-Stimmen wenn Neural2 für 2. Sprecher gleichen Typs. */
const CLASSIC_VOICE_POOL: Record<
  string,
  { locale: string; female: string[]; male: string[] }
> = {
  de: {
    locale: 'de-DE',
    female: ['de-DE-Neural2-F', 'de-DE-Wavenet-F'],
    male: ['de-DE-Neural2-D', 'de-DE-Wavenet-D'],
  },
  en: {
    locale: 'en-US',
    female: ['en-US-Neural2-F', 'en-US-Neural2-C'],
    male: ['en-US-Neural2-D', 'en-US-Neural2-J'],
  },
  fr: {
    locale: 'fr-FR',
    female: ['fr-FR-Neural2-A', 'fr-FR-Wavenet-C'],
    male: ['fr-FR-Neural2-B', 'fr-FR-Wavenet-B'],
  },
  es: {
    locale: 'es-ES',
    female: ['es-ES-Neural2-A', 'es-ES-Wavenet-C'],
    male: ['es-ES-Neural2-B', 'es-ES-Wavenet-B'],
  },
  fa: {
    locale: 'fa-IR',
    female: ['Kore', 'Aoede'],
    male: ['Charon', 'Puck'],
  },
  ar: {
    locale: 'ar-XA',
    female: ['ar-XA-Wavenet-A', 'ar-XA-Wavenet-C'],
    male: ['ar-XA-Wavenet-B', 'ar-XA-Wavenet-D'],
  },
}

function langKey(languageCode: string): string {
  return languageCode.slice(0, 2).toLowerCase()
}

export function resolveGeminiVoiceName(
  gender: 'male' | 'female',
  speakerIndex: number,
): string {
  const list = GEMINI_VOICES[gender]
  return list[speakerIndex % list.length]
}

export function resolveClassicVoiceName(
  languageCode: string,
  gender: 'male' | 'female',
  speakerIndex: number,
): { languageCode: string; name?: string } {
  const key = langKey(languageCode)
  const pool = CLASSIC_VOICE_POOL[key]
  if (pool) {
    const names = gender === 'male' ? pool.male : pool.female
    return { languageCode: pool.locale, name: names[speakerIndex % names.length] }
  }
  const locale = languageCode.includes('-') ? languageCode : `${key}-${key.toUpperCase()}`
  return { languageCode: locale }
}
