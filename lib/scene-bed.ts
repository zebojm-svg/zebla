import { recordGeminiUsage } from './ai-usage-ledger.js'
import {
  downloadSceneBed,
  sceneBedExists,
  uploadSceneBed,
} from './audio-storage.js'
import { getDialog } from './firestore.js'

const LYRIA_MODEL = process.env.LYRIA_MODEL ?? 'lyria-3-clip-preview'
const LYRIA_TIMEOUT_MS = 110_000
const CLIP_SECONDS = 30

const DEFAULT_BED_PROMPT = [
  'Create a 30-second seamless looping instrumental music bed.',
  'Quiet traditional Persian living-room ensemble: santur, setar, soft tombak.',
  'Warm, gentle, intimate. Mode close to D Shur. Background for a children\'s picture story.',
  'No vocals, no lyrics, no choir, no singing, no speech.',
  'Not 8-bit, not chiptune, not Game Boy, not synth lead, not EDM, not cartoon sting.',
  'Soft dynamics so spoken dialogue stays clearly above the music.',
].join(' ')

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) {
    throw new Error('GEMINI_API_KEY ist nicht gesetzt.')
  }
  return key
}

function bedPromptFromNote(note?: string): string {
  const extra = (note || '').trim()
  if (!extra) return DEFAULT_BED_PROMPT
  return `${DEFAULT_BED_PROMPT} Mood/instruments from the director note (ignore city noise, ignore dialogue): ${extra.slice(0, 280)}`
}

export async function generateLyriaClip(prompt: string): Promise<{ base64: string; mimeType: string }> {
  const key = apiKey()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LYRIA_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${LYRIA_MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['AUDIO', 'TEXT'] },
        }),
        signal: controller.signal,
      },
    )
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Die Musik-KI hat zu lange gebraucht.')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  const data = (await res.json()) as {
    candidates?: {
      content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; text?: string }> }
    }[]
    error?: { message?: string }
    usageMetadata?: unknown
    modelVersion?: string
  }
  if (!res.ok || data.error?.message) {
    throw new Error(data.error?.message || `Musik-KI Fehler (${res.status})`)
  }
  recordGeminiUsage('music', data.modelVersion || LYRIA_MODEL, data.usageMetadata, {
    units: CLIP_SECONDS,
    unitType: 'audio_second',
  })
  const inline = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData
  if (!inline?.data) throw new Error('Die Musik-KI hat keine Audiodatei geliefert.')
  return { base64: inline.data, mimeType: inline.mimeType || 'audio/mpeg' }
}

export async function getOrCreateSceneBed(
  dialogId: string,
  userId: string,
): Promise<{ cached: boolean; fallback: boolean; error?: string }> {
  if (await sceneBedExists(dialogId)) {
    return { cached: true, fallback: false }
  }
  const dialog = await getDialog(dialogId, userId)
  if (!dialog) throw new Error('Dialog nicht gefunden.')
  try {
    const clip = await generateLyriaClip(bedPromptFromNote(dialog.soundDirection))
    await uploadSceneBed(clip.base64, dialogId)
    return { cached: false, fallback: false }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Musik-KI fehlgeschlagen.'
    console.warn('scene-bed Lyria', message)
    return { cached: false, fallback: true, error: message }
  }
}

export async function readSceneBed(dialogId: string): Promise<Buffer> {
  return downloadSceneBed(dialogId)
}
