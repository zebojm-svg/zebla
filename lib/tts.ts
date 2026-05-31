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

/** Google Cloud TTS – Sprachcode + bevorzugte Stimmen (Wavenet/Neural2). */
const TTS_VOICES: Record<string, { locale: string; female: string; male: string }> = {
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
  fa: { locale: 'fa-IR', female: 'fa-IR-Wavenet-A', male: 'fa-IR-Wavenet-B' },
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
    return {
      languageCode: languageCode.includes('-') ? languageCode : `${key}-${key.toUpperCase()}`,
      name: undefined as string | undefined,
    }
  }
  return {
    languageCode: entry.locale,
    name: gender === 'male' ? entry.male : entry.female,
  }
}

export function isTtsConfigured(): boolean {
  return isGoogleCloudConfigured()
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

  const voice = resolveVoice(req.languageCode, req.gender ?? 'female')
  const speakingRate = Math.min(1.3, Math.max(0.4, req.rate ?? 0.85))

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
    const msg = data.error?.message ?? `TTS-Fehler (${res.status})`
    if (msg.includes('has not been used') || msg.includes('disabled')) {
      throw new Error(
        'Cloud Text-to-Speech API ist im Google-Projekt nicht aktiviert. Siehe README (TTS aktivieren).',
      )
    }
    throw new Error(msg)
  }

  if (!data.audioContent) throw new Error('Keine Audiodaten von TTS erhalten.')

  return {
    audioBase64: data.audioContent,
    mimeType: 'audio/mpeg',
    voiceName: voice.name ?? voice.languageCode,
  }
}
