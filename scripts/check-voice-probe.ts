/**
 * Probe unter Stimmen anpassen: Quota auf Deutsch, Cache, kein Reload-Lock.
 * Aufruf: npx tsx scripts/check-voice-probe.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  decideVoiceProbe,
  isTtsQuotaError,
  nextGoogleProbeAt,
  TTS_PROBE_COOLDOWN_MS,
  TTS_QUOTA_MSG,
  ttsUserError,
  voiceProbeCacheKey,
  type ProbeSample,
} from '../shared/voice-probe.ts'

const quotaRaw =
  'Quota exceeded for aiplatform.googleapis.com/generate_content_requests_per_minute_per_project_per_base_model with base model: gemini-2.5-flash-tts. Please submit a quota increase request. https://cloud.google.com/vertex-ai/docs/generative-ai/quotas-genai'

assert.equal(isTtsQuotaError(quotaRaw), true)
assert.equal(ttsUserError(quotaRaw), TTS_QUOTA_MSG)
assert.equal(ttsUserError(quotaRaw).includes('http'), false)
assert.equal(ttsUserError(quotaRaw).includes('Quota exceeded'), false)
assert.equal(ttsUserError('RESOURCE_EXHAUSTED'), TTS_QUOTA_MSG)
assert.equal(ttsUserError('429 Too Many Requests'), TTS_QUOTA_MSG)
assert.equal(
  ttsUserError('Gemini-TTS-Fehler mit https://cloud.google.com/vertex-ai/docs/foo'),
  'Gemini-TTS-Fehler mit',
)
assert.ok(ttsUserError('aiplatform.endpoints.predict denied').includes('Vertex AI User'))
console.log('✔ Quota und andere TTS-Fehler auf Deutsch, ohne Google-URL')

const keyCharon = voiceProbeCacheKey('Charon', 'male', 'fa')
const keyPuck = voiceProbeCacheKey('Puck', 'male', 'fa')
assert.notEqual(keyCharon, keyPuck)
const cache = new Map<string, ProbeSample>()
const sample: ProbeSample = { audioBase64: 'Zg==', mimeType: 'audio/mpeg' }

assert.deepEqual(decideVoiceProbe({ cache, key: keyCharon, now: 1000, quotaUntil: 0 }), {
  action: 'fetch',
})
cache.set(keyCharon, sample)
assert.deepEqual(decideVoiceProbe({ cache, key: keyCharon, now: 1000, quotaUntil: 0 }), {
  action: 'play-cache',
  sample,
})
assert.deepEqual(decideVoiceProbe({ cache, key: keyPuck, now: 1000, quotaUntil: 5000 }), {
  action: 'wait-quota',
  message: TTS_QUOTA_MSG,
})
assert.deepEqual(decideVoiceProbe({ cache, key: keyCharon, now: 1000, quotaUntil: 5000 }), {
  action: 'play-cache',
  sample,
})
assert.equal(nextGoogleProbeAt(0, TTS_PROBE_COOLDOWN_MS), 0)
assert.equal(nextGoogleProbeAt(1000, 1000), TTS_PROBE_COOLDOWN_MS)
console.log('✔ Cache spielt dieselbe Stimme nochmal, Quota sperrt nur neue Google-Rufe')

const voicesSrc = readFileSync(new URL('../src/story/FilmCastVoices.tsx', import.meta.url), 'utf8')
const ttsSrc = readFileSync(new URL('../lib/tts.ts', import.meta.url), 'utf8')
assert.equal(voicesSrc.includes('await el.play()'), false)
assert.ok(voicesSrc.includes('setBusy(null)'))
assert.ok(voicesSrc.includes('revokeObjectURL'))
assert.ok(voicesSrc.includes('stopPreview()'))
assert.ok(voicesSrc.includes('ttsUserError'))
assert.ok(ttsSrc.includes("from '../shared/voice-probe.js'"))
assert.ok(ttsSrc.includes('ttsUserError'))
assert.equal(ttsSrc.includes('Please submit a quota increase'), false)
console.log('✔ Probe wartet nicht auf play(); Quota-Text kommt aus ttsUserError')
