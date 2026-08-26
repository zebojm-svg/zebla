/** Client-Wartezeit für normale API-Aufrufe. */
export const DEFAULT_API_TIMEOUT_MS = 55_000

/**
 * Lange Film-Planung (Dialog aus Prompt, Storyboard-JSON).
 * Vercel maxDuration ist 120 s — etwas darunter bleiben, damit die Antwort noch ankommt.
 */
export const FILM_PLAN_TIMEOUT_MS = 118_000

const IMAGE_GEN_PATHS = new Set([
  '/image',
  '/image-all',
  '/image-lines',
  '/visual-test',
  '/story-generate-scene',
  '/story-generate-character',
  '/story-generate-environment',
  '/film-storyboard-sketch',
])

export function apiPathOnly(path: string): string {
  const q = path.indexOf('?')
  return q >= 0 ? path.slice(0, q) : path
}

export function isImageGenPath(path: string): boolean {
  return IMAGE_GEN_PATHS.has(apiPathOnly(path))
}

export function clientTimeoutMessage(path: string, reason: 'abort' | 'server'): string {
  if (isImageGenPath(path)) {
    return reason === 'server'
      ? 'Server-Zeitlimit überschritten. Bitte nur ein einzelnes Bild generieren und erneut versuchen.'
      : 'Zeitlimit überschritten. Bitte nur ein Bild auf einmal generieren.'
  }
  return reason === 'server'
    ? 'Server-Zeitlimit überschritten. Bitte noch einmal versuchen.'
    : 'Zeitlimit überschritten. Bitte noch einmal versuchen.'
}
