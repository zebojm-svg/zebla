/**
 * Stammbild je Person: Gesicht, Haare, Kleidung wie im Regiebuch.
 * Passt das Katalogbild nicht zum lookEn, wird ein neues gezeichnet und in der Bibliothek abgelegt.
 */

import { pickedCastUrl, type CatalogCast } from './catalog-cast.js'
import { identityReferenceUrl } from './library-identities.js'
import type { FilmContinuity } from './film-continuity.js'
import type { StoryLibraryAsset } from './story-types.js'

export interface FilmPortraitStamp {
  name: string
  lookKey: string
  url: string
  assetId?: string
  checked?: boolean
  ok?: boolean
  noteDe?: string
  fixEn?: string
  tries?: number
  byUser?: boolean
  hintDe?: string
  model?: string
  at: string
}

export const PORTRAIT_AUTO_TRIES = 2

const GARMENT =
  /\b(shirt|t-?shirt|blouse|top|hoodie|sweater|pullover|coat|jacket|mantel|jeans|pants|trousers|skirt|dress|sneakers|shoes|boots|headset|glasses|brille|hemd|hose|jacke|mantel|pullover|hoodie|schuhe)\b/gi
const COLOR =
  /\b(white|black|red|blue|green|yellow|orange|grey|gray|brown|beige|pink|purple|violet|weiss|weis|schwarz|rot|blau|gruen|grün|gelb|orange|grau|braun|beige|rosa|lila)\b/gi

export function portraitLookKey(lookEn: string): string {
  return lookEn.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 220)
}

function normName(name: string): string {
  return name.trim().toLowerCase()
}

export function portraitFor(
  stamps: FilmPortraitStamp[] | undefined,
  name: string,
): FilmPortraitStamp | undefined {
  const want = normName(name)
  if (!want) return undefined
  return (stamps ?? []).find((stamp) => normName(stamp.name) === want && stamp.url.startsWith('http'))
}

export function withPortraitStamp(
  stamps: FilmPortraitStamp[] | undefined,
  stamp: FilmPortraitStamp,
): FilmPortraitStamp[] {
  return [...(stamps ?? []).filter((have) => normName(have.name) !== normName(stamp.name)), stamp]
}

/** Gespeicherte Beschreibung und Regiebuch weichen bei Kleidung oder Haare stark auseinander. */
export function portraitTextDrift(stored: string, lookEn: string): boolean {
  const pick = (text: string, re: RegExp) =>
    new Set(
      [...text.toLowerCase().matchAll(re)]
        .map((match) => match[0]!.toLowerCase())
        .filter(Boolean),
    )
  const sa = pick(stored, GARMENT)
  const sb = pick(lookEn, GARMENT)
  const ca = pick(stored, COLOR)
  const cb = pick(lookEn, COLOR)
  for (const word of sa) {
    if (sb.size && !sb.has(word)) return true
  }
  for (const word of sb) {
    if (sa.size && !sa.has(word)) return true
  }
  for (const word of ca) {
    if (cb.size && !cb.has(word)) return true
  }
  for (const word of cb) {
    if (ca.size && !ca.has(word)) return true
  }
  if (sa.size === 0 && sb.size > 0 && stored.trim().length > 12) return true
  if (portraitLookKey(stored) !== portraitLookKey(lookEn) && sa.size + ca.size > 0) {
    const overlap = [...sa].filter((w) => sb.has(w)).length + [...ca].filter((w) => cb.has(w)).length
    if (overlap === 0) return true
  }
  return false
}

export function portraitNeedsCheck(stamp: FilmPortraitStamp | undefined, lookEn: string): boolean {
  const key = portraitLookKey(lookEn)
  if (!stamp) return true
  if (stamp.lookKey !== key) return true
  return !stamp.checked
}

export function portraitNeedsRedraw(stamp: FilmPortraitStamp | undefined): boolean {
  return Boolean(
    stamp && stamp.checked && stamp.ok === false && !stamp.byUser && (stamp.tries ?? 1) < PORTRAIT_AUTO_TRIES,
  )
}

export function portraitStateDe(stamp: FilmPortraitStamp | undefined): string {
  if (!stamp) return 'Noch kein Stammbild geprüft.'
  if (!stamp.checked) return 'Die Regie muss das Stammbild noch mit dem Regiebuch vergleichen.'
  if (stamp.ok === false) {
    return stamp.noteDe?.trim()
      ? `Passt nicht: ${stamp.noteDe}`
      : 'Passt nicht zum Regiebuch — neu zeichnen.'
  }
  return stamp.noteDe?.trim() ? stamp.noteDe : 'Passt zum Regiebuch.'
}

export function portraitFailedDe(name: string, reason: string): string {
  const why = reason.trim().replace(/[.\s]+$/, '') || 'Grund unbekannt'
  return `Das Stammbild von ${name} konnte nicht gezeichnet werden: ${why}.`
}

/** Was in der Bibliothek oder im Katalog liegt — auch wenn es noch nicht zum Regiebuch passt. */
export function portraitRefUrl(
  library: StoryLibraryAsset[],
  picks: CatalogCast | null | undefined,
  name: string,
): string | undefined {
  return pickedCastUrl(library, picks?.personIds, name) || identityReferenceUrl(library, name)
}

/** Nur wenn die Regie das Bild zum aktuellen lookEn gutgeheissen hat — sonst nicht an den Maler. */
export function portraitPaintUrl(
  continuity: FilmContinuity | undefined,
  library: StoryLibraryAsset[],
  picks: CatalogCast | null | undefined,
  name: string,
  lookEn: string,
): string | undefined {
  const url = portraitRefUrl(library, picks, name)
  if (!url) return undefined
  const stamp = portraitFor(continuity?.portraitStamps, name)
  const key = portraitLookKey(lookEn)
  if (!stamp || stamp.url !== url || stamp.lookKey !== key || stamp.ok === false) return undefined
  if (!stamp.checked) return undefined
  return url
}

export function readPortraitAnswer(raw: unknown): { ok: boolean; noteDe: string; fixEn: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const noteDe = typeof row.noteDe === 'string' ? row.noteDe.trim().slice(0, 240) : ''
  const fixEn = typeof row.fixEn === 'string' ? row.fixEn.trim().slice(0, 500) : ''
  const ok = row.ok === true
  return { ok, noteDe, fixEn }
}