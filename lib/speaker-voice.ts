import type { CharacterVisual, Dialog } from '../shared/types.js'
import { guessSpeakerGenderFromName } from './speaker-gender.js'

export interface SpeakerVoiceProfile {
  gender: 'male' | 'female'
  voiceName: string
  voicePrompt?: string
}

/** Gemini-TTS-Stimmen – je Geschlecht, feste Reihenfolge pro Sprecher. */
const GEMINI_VOICES = {
  female: ['Kore', 'Aoede', 'Leda'],
  male: ['Charon', 'Puck', 'Fenrir'],
} as const

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
  ko: {
    locale: 'ko-KR',
    female: ['ko-KR-Neural2-A', 'ko-KR-Wavenet-A'],
    male: ['ko-KR-Neural2-C', 'ko-KR-Neural2-B'],
  },
  ja: {
    locale: 'ja-JP',
    female: ['ja-JP-Neural2-B', 'ja-JP-Wavenet-A'],
    male: ['ja-JP-Neural2-D', 'ja-JP-Neural2-C'],
  },
}

function langKey(languageCode: string): string {
  return languageCode.slice(0, 2).toLowerCase()
}

function usesGeminiTts(languageCode: string): boolean {
  return langKey(languageCode) === 'fa'
}

export function resolveSpeakerGender(
  speaker: string,
  speakerIndex: number,
  characterBible?: CharacterVisual[],
  speakerProfiles?: Record<string, { gender?: 'male' | 'female' }>,
): 'male' | 'female' {
  const fromProfile = speakerProfiles?.[speaker]?.gender
  if (fromProfile === 'male' || fromProfile === 'female') return fromProfile
  const fromBible = characterBible?.find((c) => c.name === speaker)?.gender
  if (fromBible === 'male' || fromBible === 'female') return fromBible
  return guessSpeakerGenderFromName(speaker, speakerIndex)
}

function orderedSpeakers(dialog: Dialog): string[] {
  const order: string[] = []
  const seen = new Set<string>()
  for (const section of dialog.sections) {
    for (const line of section.lines) {
      if (!seen.has(line.speaker)) {
        seen.add(line.speaker)
        order.push(line.speaker)
      }
    }
  }
  return order
}

function speakerIndexMap(dialog: Dialog): Map<string, number> {
  const map = new Map<string, number>()
  orderedSpeakers(dialog).forEach((name, idx) => map.set(name, idx))
  return map
}

function pickGeminiVoice(gender: 'male' | 'female', genderSlot: number): string {
  const list = GEMINI_VOICES[gender]
  return list[genderSlot % list.length]
}

function pickClassicVoice(
  languageCode: string,
  gender: 'male' | 'female',
  genderSlot: number,
): string | undefined {
  const pool = CLASSIC_VOICE_POOL[langKey(languageCode)]
  if (!pool) return undefined
  const names = gender === 'male' ? pool.male : pool.female
  return names[genderSlot % names.length]
}

/** Weist jedem Sprecher EINMALIG eine feste Stimme zu (nach Geschlecht, nicht nach Zeilenindex). */
export function buildSpeakerVoiceProfiles(dialog: Dialog): Record<string, SpeakerVoiceProfile> {
  const indices = speakerIndexMap(dialog)
  const bible = dialog.characterBible
  const profiles: Record<string, SpeakerVoiceProfile> = {}
  let femaleSlot = 0
  let maleSlot = 0
  const gemini = usesGeminiTts(dialog.targetLanguage)

  for (const speaker of orderedSpeakers(dialog)) {
    const userProfile = dialog.speakerProfiles?.[speaker]
    const fromBible = bible?.find((c) => c.name === speaker)
    if (fromBible?.voiceName && fromBible.gender && !userProfile?.voiceName) {
      profiles[speaker] = {
        gender: fromBible.gender,
        voiceName: fromBible.voiceName,
        voicePrompt: userProfile?.voicePrompt,
      }
      continue
    }

    const speakerIdx = indices.get(speaker) ?? 0
    const gender = resolveSpeakerGender(speaker, speakerIdx, bible, dialog.speakerProfiles)
    const genderSlot = gender === 'male' ? maleSlot++ : femaleSlot++
    const voiceName =
      userProfile?.voiceName ??
      (gemini
        ? pickGeminiVoice(gender, genderSlot)
        : pickClassicVoice(dialog.targetLanguage, gender, genderSlot) ??
          (gender === 'male' ? 'Charon' : 'Kore'))

    profiles[speaker] = {
      gender,
      voiceName,
      voicePrompt: userProfile?.voicePrompt?.trim() || undefined,
    }
  }
  return profiles
}

export function getSpeakerVoice(
  dialog: Dialog,
  speaker: string,
): SpeakerVoiceProfile {
  const profiles = dialog.speakerVoices ?? buildSpeakerVoiceProfiles(dialog)
  const base = profiles[speaker]
  const user = dialog.speakerProfiles?.[speaker]
  const idx = speakerIndexMap(dialog).get(speaker) ?? 0
  const gender =
    user?.gender ??
    base?.gender ??
    resolveSpeakerGender(speaker, idx, dialog.characterBible, dialog.speakerProfiles)
  const voiceName =
    user?.voiceName ??
    base?.voiceName ??
    (usesGeminiTts(dialog.targetLanguage)
      ? pickGeminiVoice(gender, 0)
      : pickClassicVoice(dialog.targetLanguage, gender, 0) ?? 'Kore')
  const voicePrompt = user?.voicePrompt?.trim() || base?.voicePrompt
  return { gender, voiceName, voicePrompt: voicePrompt || undefined }
}

export function mergeVoiceProfilesIntoDialog(
  dialog: Dialog,
  profiles: Record<string, SpeakerVoiceProfile>,
): { speakerVoices: Record<string, SpeakerVoiceProfile>; characterBible?: CharacterVisual[] } {
  const characterBible = dialog.characterBible?.map((c) => {
    const p = profiles[c.name]
    if (!p) return c
    return { ...c, gender: p.gender, voiceName: p.voiceName }
  })
  return { speakerVoices: profiles, characterBible }
}

export function resolveGeminiVoiceName(
  gender: 'male' | 'female',
  genderSlot: number,
): string {
  return pickGeminiVoice(gender, genderSlot)
}

export function resolveClassicVoiceName(
  languageCode: string,
  gender: 'male' | 'female',
  genderSlot: number,
): { languageCode: string; name?: string } {
  const key = langKey(languageCode)
  const pool = CLASSIC_VOICE_POOL[key]
  if (pool) {
    const names = gender === 'male' ? pool.male : pool.female
    return { languageCode: pool.locale, name: names[genderSlot % names.length] }
  }
  const locale = languageCode.includes('-') ? languageCode : `${key}-${key.toUpperCase()}`
  return { languageCode: locale }
}
