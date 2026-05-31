import { getGoogleAccessToken, isGoogleCloudConfigured } from './google-auth-token.js'

export interface TtsRequest {
  text: string
  languageCode: string
  rate?: number
  gender?: 'male' | 'female'
}

export interface TtsResult {
  audioBase64: string
  mimeType: string
  voiceName: string
}

export interface TtsHealth {
  configured: boolean
  working: boolean
  provider: string
  geminiTts?: boolean
  error?: string
  hint?: string
}

const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL ?? 'gemini-2.5-flash-tts'

/** Sprachen ohne klassische Stimmen – nur über Gemini-TTS (Preview). */
const GEMINI_ONLY_LANGS = new Set(['fa'])

const GEMINI_VOICE = { female: 'Kore', male: 'Charon' } as const

/** Google Cloud TTS – klassische Stimmen (Neural2/Wavenet). */
const CLASSIC_VOICES: Record<string, { locale: string; female?: string; male?: string }> = {
  de: { locale: 'de-DE', female: 'de-DE-Neural2-F', male: 'de-DE-Neural2-D' },
  en: { locale: 'en-US', female: 'en-US-Neural2-F', male: 'en-US-Neural2-D' },
  fr: { locale: 'fr-FR', female: 'fr-FR-Neural2-A', male: 'fr-FR-Neural2-B' },
  es: { locale: 'es-ES', female: 'es-ES-Neural2-A', male: 'es-ES-Neural2-B' },
  it: { locale: 'it-IT', female: 'it-IT-Neural2-A', male: 'it-IT-Neural2-C' },
  pt: { locale: 'pt-BR', female: 'pt-BR-Neural2-A', male: 'pt-BR-Neural2-B' },
  nl: { locale: 'nl-NL', female: 'nl-NL-Wavenet-F', male: 'nl-NL-Wavenet-M' },
  pl: { locale: 'pl-PL', female: 'pl-PL-Wavenet-F', male: 'pl-PL-Wavenet-M' },
  tr: { locale: 'tr-TR', female: 'tr-TR-Wavenet-A', male: 'tr-TR-Wavenet-B' },
  ja: { locale: 'ja-JP', female: 'ja-JP-Neural2-B', male: 'ja-JP-Neural2-D' },
  zh: { locale: 'cmn-CN', female: 'cmn-CN-Wavenet-A', male: 'cmn-CN-Wavenet-B' },
  ar: { locale: 'ar-XA', female: 'ar-XA-Wavenet-A', male: 'ar-XA-Wavenet-B' },
  ru: { locale: 'ru-RU', female: 'ru-RU-Wavenet-A', male: 'ru-RU-Wavenet-B' },
  sv: { locale: 'sv-SE', female: 'sv-SE-Wavenet-A', male: 'sv-SE-Wavenet-B' },
  da: { locale: 'da-DK', female: 'da-DK-Neural2-F', male: 'da-DK-Neural2-D' },
  no: { locale: 'nb-NO', female: 'nb-NO-Wavenet-A', male: 'nb-NO-Wavenet-B' },
  el: { locale: 'el-GR', female: 'el-GR-Wavenet-A', male: 'el-GR-Wavenet-B' },
  cs: { locale: 'cs-CZ', female: 'cs-CZ-Wavenet-A', male: 'cs-CZ-Wavenet-B' },
  hu: { locale: 'hu-HU', female: 'hu-HU-Wavenet-A', male: 'hu-HU-Wavenet-B' },
  ko: { locale: 'ko-KR', female: 'ko-KR-Neural2-A', male: 'ko-KR-Neural2-C' },
}

function langKey(languageCode: string): string {
  return languageCode.slice(0, 2).toLowerCase()
}

function usesGeminiTts(languageCode: string): boolean {
  return GEMINI_ONLY_LANGS.has(langKey(languageCode))
}

function geminiLocale(languageCode: string): string {
  const key = langKey(languageCode)
  if (key === 'fa') return 'fa-ir'
  return languageCode.toLowerCase()
}

function resolveClassicVoice(languageCode: string, gender: 'male' | 'female' = 'female') {
  const entry = CLASSIC_VOICES[langKey(languageCode)]
  if (!entry) {
    const locale = languageCode.includes('-')
      ? languageCode
      : `${langKey(languageCode)}-${langKey(languageCode).toUpperCase()}`
    return { languageCode: locale, name: undefined as string | undefined }
  }
  return {
    languageCode: entry.locale,
    name: gender === 'male' ? entry.male : entry.female,
  }
}

function formatApiError(msg: string): string {
  if (msg.includes('aiplatform.googleapis.com') || msg.includes('Agent Platform API')) {
    return 'Vertex AI API ist nicht aktiv. Für Persisch/Dari in der Google Cloud Console „Vertex AI API“ aktivieren.'
  }
  if (msg.includes('billing') || msg.includes('BILLING')) {
    return 'Cloud-Sprachausgabe braucht ein aktives Abrechnungskonto im Google-Projekt.'
  }
  if (msg.includes('has not been used') || msg.includes('disabled') || msg.includes('PERMISSION_DENIED')) {
    return 'Google Cloud API nicht aktiv oder keine Berechtigung.'
  }
  return msg
}

function projectId(): string {
  return process.env.FIREBASE_PROJECT_ID ?? ''
}

async function callClassicSynthesize(
  token: string,
  text: string,
  voice: { languageCode: string; name?: string },
  speakingRate: number,
): Promise<TtsResult> {
  const body = {
    input: { text },
    voice: {
      languageCode: voice.languageCode,
      ...(voice.name ? { name: voice.name } : {}),
    },
    audioConfig: { audioEncoding: 'MP3', speakingRate, pitch: 0 },
  }

  const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = (await res.json()) as { audioContent?: string; error?: { message?: string } }
  if (!res.ok) throw new Error(formatApiError(data.error?.message ?? `TTS-Fehler (${res.status})`))
  if (!data.audioContent) throw new Error('Keine Audiodaten von TTS erhalten.')

  return {
    audioBase64: data.audioContent,
    mimeType: 'audio/mpeg',
    voiceName: voice.name ?? voice.languageCode,
  }
}

async function callGeminiSynthesize(
  token: string,
  text: string,
  languageCode: string,
  gender: 'male' | 'female',
  speakingRate: number,
): Promise<TtsResult> {
  const locale = geminiLocale(languageCode)
  const voiceName = gender === 'male' ? GEMINI_VOICE.male : GEMINI_VOICE.female

  const body = {
    input: {
      text,
      prompt:
        'Read clearly and naturally for language learners. Moderate pace, friendly teaching tone.',
    },
    voice: {
      languageCode: locale,
      name: voiceName,
      model_name: GEMINI_TTS_MODEL,
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate,
    },
  }

  const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-goog-user-project': projectId(),
    },
    body: JSON.stringify(body),
  })

  const data = (await res.json()) as { audioContent?: string; error?: { message?: string } }
  if (!res.ok) throw new Error(formatApiError(data.error?.message ?? `Gemini-TTS-Fehler (${res.status})`))
  if (!data.audioContent) throw new Error('Keine Audiodaten von Gemini-TTS erhalten.')

  return {
    audioBase64: data.audioContent,
    mimeType: 'audio/mpeg',
    voiceName: `${GEMINI_TTS_MODEL}/${voiceName}`,
  }
}

export function isTtsConfigured(): boolean {
  return isGoogleCloudConfigured()
}

export async function checkTtsHealth(languageCode?: string): Promise<TtsHealth> {
  if (!isTtsConfigured()) {
    return { configured: false, working: false, provider: 'google-cloud-tts' }
  }

  try {
    const token = await getGoogleAccessToken()
    if (!token) {
      return {
        configured: true,
        working: false,
        provider: 'google-cloud-tts',
        error: 'Firebase-Zugangsdaten liefern kein Google-Token.',
      }
    }

    const needsGemini = languageCode ? usesGeminiTts(languageCode) : true

    if (!needsGemini) {
      await callClassicSynthesize(
        token,
        'Test',
        { languageCode: 'de-DE', name: 'de-DE-Neural2-F' },
        1,
      )
      return { configured: true, working: true, provider: 'google-cloud-tts' }
    }

    let geminiOk = false
    let geminiError: string | undefined
    try {
      await callGeminiSynthesize(token, 'سلام', 'fa', 'female', 1)
      geminiOk = true
    } catch (err) {
      geminiError = err instanceof Error ? err.message : 'Gemini-TTS fehlgeschlagen'
    }

    if (geminiOk) {
      return {
        configured: true,
        working: true,
        geminiTts: true,
        provider: 'google-gemini-tts',
      }
    }

    return {
      configured: true,
      working: false,
      geminiTts: false,
      provider: 'google-gemini-tts',
      error: geminiError,
      hint: geminiError?.includes('Vertex AI')
        ? 'https://console.cloud.google.com/apis/library/aiplatform.googleapis.com?project=zebla-f517e'
        : undefined,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TTS-Test fehlgeschlagen'
    return {
      configured: true,
      working: false,
      provider: 'google-cloud-tts',
      error: message,
    }
  }
}

export async function synthesizeSpeech(req: TtsRequest): Promise<TtsResult> {
  const text = req.text.trim()
  if (!text) throw new Error('Text fehlt.')

  const token = await getGoogleAccessToken()
  if (!token) {
    throw new Error('Cloud-TTS nicht konfiguriert. FIREBASE_* auf Vercel prüfen.')
  }

  const gender = req.gender ?? 'female'
  const speakingRate = Math.min(1.3, Math.max(0.4, req.rate ?? 0.85))

  if (usesGeminiTts(req.languageCode)) {
    return callGeminiSynthesize(token, text, req.languageCode, gender, speakingRate)
  }

  const resolved = resolveClassicVoice(req.languageCode, gender)
  const attempts: { languageCode: string; name?: string }[] = [
    ...(resolved.name
      ? [{ languageCode: resolved.languageCode, name: resolved.name }]
      : []),
    { languageCode: resolved.languageCode },
  ]
  const seen = new Set<string>()
  let lastError: Error | null = null

  for (const voice of attempts) {
    const key = `${voice.languageCode}:${voice.name ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    try {
      return await callClassicSynthesize(token, text, voice, speakingRate)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  throw lastError ?? new Error('Sprachausgabe fehlgeschlagen.')
}
