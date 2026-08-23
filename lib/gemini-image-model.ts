/**
 * Welches Gemini-Bildmodell wir nehmen.
 * Die Gemini-App nutzt oft schon «Nano Banana 2» (gemini-3.1-flash-image) —
 * das hält Personen über Posen gleich und kann transparent freistellen.
 * Älteres gemini-2.5-flash-image bleibt Notnagel, falls 3.1 am Key fehlt.
 */

const LEGACY_DEFAULTS = new Set([
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-preview-image',
  'gemini-2.5-flash-image-preview',
])

export const GEMINI_IMAGE_PREFERRED = 'gemini-3.1-flash-image'
export const GEMINI_IMAGE_FALLBACK = 'gemini-2.5-flash-image'

function cleanModelId(raw: string): string {
  return raw
    .replace(/^models\//, '')
    .replace('gemini-2.5-flash-preview-image', 'gemini-2.5-flash-image')
    .trim()
}

export function geminiImageModelCandidates(): string[] {
  const env = process.env.GEMINI_IMAGE_MODEL
    ? cleanModelId(process.env.GEMINI_IMAGE_MODEL)
    : ''
  const out: string[] = []
  if (env && !LEGACY_DEFAULTS.has(env)) out.push(env)
  out.push(GEMINI_IMAGE_PREFERRED, GEMINI_IMAGE_FALLBACK)
  return [...new Set(out.filter(Boolean))]
}

export function isGeminiImageUnavailable(message: string): boolean {
  return /not found|NOT_FOUND|is not found|not supported|not available|not available to your|UNKNOWN_MODEL/i.test(
    message,
  )
}
