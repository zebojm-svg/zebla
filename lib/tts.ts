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
  error?: string
}

/** Google Cloud TTS – bevorzugte Stimmen (mit Fallback auf nur languageCode). */
const TTS_VOICES: Record<string, { locale: string; female?: string; male?: string }> = {
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
  fa: { locale: 'fa-IR', female: 'fa-IR-Standard-A', male: 'fa-IR-Standard-B' },
  ru: { locale: 'ru-RU', female: 'ru-RU-Wavenet-A', male: 'ru-RU-Wavenet-B' },
  sv: { locale: 'sv-SE', female: 'sv-SE-Wavenet-A', male: 'sv-SE-Wavenet-B' },
  da: { locale: 'da-DK', female: 'da-DK-Neural2-F', male: 'da-DK-Neural2-D' },
  no: { locale: 'nb-NO', female: 'nb-NO-Wavenet-A', male: 'nb-NO-Wavenet-B' },
  el: { locale: 'el-GR', female: 'el-GR-Wavenet-A', male: 'el-GR-Wavenet-B' },
  cs: { locale: 'cs-CZ', female: 'cs-CZ-Wavenet-A', male: 'cs-CZ-Wavenet-B' },
  hu: { locale: 'hu-HU', female: 'hu-HU-Wavenet-A', male: 'hu-HU-Wavenet-B' },
  ko: { locale: 'ko-KR', female: 'ko-KR-Neural2-A', male: 'ko-KR-Neural2-C' },
}

function resolveVoice(languageCode: string, gender: 'male' | 'female' = 'female') {
  const key = languageCode.slice(0, 2).toLowerCase()
  const entry = TTS_VOICES[key]
  if (!entry) {
    const locale = languageCode.includes('-')
      ? languageCode
      : `${key}-${key.toUpperCase()}`
    return { languageCode: locale, name: undefined as string | undefined }
  }
  return {
    languageCode: entry.locale,
    name: gender === 'male' ? entry.male : entry.female,
  }
}

function formatApiError(msg: string): string {
  if (msg.includes('billing') || msg.includes('BILLING')) {
    return 'Cloud Text-to-Speech braucht ein aktives Abrechnungskonto im Google-Projekt (Blaze/Billing aktivieren).'
  }
  if (msg.includes('has not been used') || msg.includes('disabled') || msg.includes('PERMISSION_DENIED')) {
    return 'Cloud Text-to-Speech API ist nicht aktiv oder keine Berechtigung. API in der Google Console aktivieren.'
  }
  return msg
}

async function callSynthesize(
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
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate,
      pitch: 0,
    },
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
  if (!res.ok) {
    throw new Error(formatApiError(data.error?.message ?? `TTS-Fehler (${res.status})`))
  }
  if (!data.audioContent) throw new Error('Keine Audiodaten von TTS erhalten.')

  return {
    audioBase64: data.audioContent,
    mimeType: 'audio/mpeg',
    voiceName: voice.name ?? voice.languageCode,
  }
}

export function isTtsConfigured(): boolean {
  return isGoogleCloudConfigured()
}

export async function checkTtsHealth(): Promise<TtsHealth> {
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
        error: 'Firebase-Zugangsdaten liefern kein Google-Token. FIREBASE_PRIVATE_KEY auf Vercel prüfen.',
      }
    }

    const res = await fetch('https://texttospeech.googleapis.com/v1/voices', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = (await res.json()) as { voices?: unknown[]; error?: { message?: string } }
    if (!res.ok) {
      return {
        configured: true,
        working: false,
        provider: 'google-cloud-tts',
        error: formatApiError(data.error?.message ?? `Stimmen-Abfrage fehlgeschlagen (${res.status})`),
      }
    }

    await callSynthesize(token, 'سلام', { languageCode: 'fa-IR' }, 1)

    return { configured: true, working: true, provider: 'google-cloud-tts' }
  } catch (err) {
    return {
      configured: true,
      working: false,
      provider: 'google-cloud-tts',
      error: err instanceof Error ? err.message : 'TTS-Test fehlgeschlagen',
    }
  }
}

export async function synthesizeSpeech(req: TtsRequest): Promise<TtsResult> {
  const text = req.text.trim()
  if (!text) throw new Error('Text fehlt.')

  const token = await getGoogleAccessToken()
  if (!token) {
    throw new Error(
      'Cloud-TTS nicht konfiguriert. FIREBASE_* Zugangsdaten auf Vercel prüfen.',
    )
  }

  const resolved = resolveVoice(req.languageCode, req.gender ?? 'female')
  const speakingRate = Math.min(1.3, Math.max(0.4, req.rate ?? 0.85))

  const attempts: { languageCode: string; name?: string }[] = [
    { languageCode: resolved.languageCode, name: resolved.name },
    { languageCode: resolved.languageCode },
  ]

  let lastError: Error | null = null
  for (const voice of attempts) {
    try {
      return await callSynthesize(token, text, voice, speakingRate)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  throw lastError ?? new Error('Sprachausgabe fehlgeschlagen.')
}
