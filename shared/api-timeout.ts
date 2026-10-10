/** Client-Wartezeit für normale API-Aufrufe. */
export const DEFAULT_API_TIMEOUT_MS = 55_000

/**
 * Lange Film-Planung (Dialog aus Prompt, Storyboard-JSON).
 * Vercel maxDuration ist 120 s — etwas darunter bleiben, damit die Antwort noch ankommt.
 */
export const FILM_PLAN_TIMEOUT_MS = 118_000

/** Übersetzen / Birkenbihl: ein längerer Text, eine KI-Antwort. */
export const TEXT_AI_TIMEOUT_MS = FILM_PLAN_TIMEOUT_MS

const IMAGE_GEN_PATHS = new Set([
  '/image',
  '/image-all',
  '/image-lines',
  '/visual-test',
  '/story-generate-scene',
  '/story-generate-character',
  '/story-generate-environment',
  '/film-storyboard-sketch',
  '/film-storyboard-still',
])

export function apiPathOnly(path: string): string {
  const q = path.indexOf('?')
  return q >= 0 ? path.slice(0, q) : path
}

export function isImageGenPath(path: string): boolean {
  return IMAGE_GEN_PATHS.has(apiPathOnly(path))
}

const TEXT_AI_PATHS = new Set(['/translate', '/birkenbihl', '/split'])

export function isTextAiPath(path: string): boolean {
  return TEXT_AI_PATHS.has(apiPathOnly(path))
}

export function clientTimeoutMessage(path: string, reason: 'abort' | 'server'): string {
  if (isImageGenPath(path)) {
    return reason === 'server'
      ? 'Server-Zeitlimit überschritten. Bitte nur ein einzelnes Bild generieren und erneut versuchen.'
      : 'Zeitlimit überschritten. Bitte nur ein Bild auf einmal generieren.'
  }
  if (isTextAiPath(path)) {
    return reason === 'server'
      ? 'Die Übersetzung hat auf dem Server zu lange gedauert. Bitte noch einmal versuchen (kann bis zu zwei Minuten brauchen).'
      : 'Zeitlimit. Bitte noch einmal auf «Deutsch unter die Zeilen» klicken — wir warten bis zu zwei Minuten.'
  }
  return reason === 'server'
    ? 'Server-Zeitlimit überschritten. Bitte noch einmal versuchen.'
    : 'Zeitlimit überschritten. Bitte noch einmal versuchen.'
}
