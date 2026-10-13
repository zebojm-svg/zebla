/** Probe unter «Stimmen anpassen»: Quota auf Deutsch, Cache, kurze Pause. */

export const TTS_QUOTA_MSG = 'Google ist gerade voll. In einer Minute nochmal Probe.'

export const TTS_PROBE_COOLDOWN_MS = 1200
export const TTS_QUOTA_COOLDOWN_MS = 45_000

export type ProbeSample = {
  audioBase64: string
  mimeType: string
}

export type ProbeDecision =
  | { action: 'play-cache'; sample: ProbeSample }
  | { action: 'wait-quota'; message: string }
  | { action: 'fetch' }

const QUOTA_HINTS = [
  'quota',
  'resource_exhausted',
  'resource exhausted',
  'rate limit',
  'rate_limit',
  'generate_content_requests_per_minute',
  'quota increase',
]

export function voiceProbeCacheKey(
  voiceName: string,
  gender: string,
  languageCode: string,
): string {
  return `${languageCode}|${gender}|${voiceName}`
}

export function isTtsQuotaError(raw: string): boolean {
  const text = raw.trim()
  if (/\b429\b/.test(text)) return true
  const lower = text.toLowerCase()
  return QUOTA_HINTS.some((hint) => lower.includes(hint))
}

function stripUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim()
}

/** Rohtext von Google/Vertex → kurzer deutscher Satz, ohne Quota-URL. */
export function ttsUserError(raw: string): string {
  const msg = raw.trim()
  if (!msg) return 'Sprachprobe fehlgeschlagen. Bitte nochmal Probe.'
  if (isTtsQuotaError(msg)) return TTS_QUOTA_MSG
  if (msg.includes('aiplatform.endpoints.predict')) {
    return (
      'Gemini-Sprachausgabe: Dem Firebase-Service-Account fehlt die Rolle ' +
      '„Vertex AI User“ im Google-Projekt zebla-f517e (IAM → Mitglieder → Service-Account → Rolle hinzufügen).'
    )
  }
  if (
    msg.includes('SERVICE_DISABLED') ||
    (msg.includes('has not been used') && msg.includes('aiplatform'))
  ) {
    return 'Vertex AI API ist nicht aktiv. In der Google Cloud Console „Vertex AI API“ aktivieren.'
  }
  if (msg.includes('billing') || msg.includes('BILLING')) {
    return 'Cloud-Sprachausgabe braucht ein aktives Abrechnungskonto im Google-Projekt.'
  }
  if (msg.includes('has not been used') || msg.includes('disabled')) {
    return 'Google Cloud API nicht aktiv. Text-to-Speech API bzw. Vertex AI API in der Cloud Console aktivieren.'
  }
  const cleaned = stripUrls(msg)
  if (!cleaned) return 'Sprachprobe fehlgeschlagen. Bitte nochmal Probe.'
  return cleaned
}

export function decideVoiceProbe(opts: {
  cache: Map<string, ProbeSample>
  key: string
  now: number
  quotaUntil: number
}): ProbeDecision {
  const cached = opts.cache.get(opts.key)
  if (cached) return { action: 'play-cache', sample: cached }
  if (opts.now < opts.quotaUntil) {
    return { action: 'wait-quota', message: TTS_QUOTA_MSG }
  }
  return { action: 'fetch' }
}

export function nextGoogleProbeAt(lastFetchAt: number, now: number): number {
  return Math.max(0, lastFetchAt + TTS_PROBE_COOLDOWN_MS - now)
}

export function probeNow(): number {
  return Date.now()
}
