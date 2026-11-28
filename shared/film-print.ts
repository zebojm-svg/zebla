import type { FilmStoryboardPanel } from './film-storyboard.js'
import { regiePlanErrorLineDe } from './film-regie-plan.js'
import type { RegieAttempt } from './film-regie-plan.js'

/** Kürzt langen Text für den kompakten Druck (max. Zeilen mit «…»). */
export function printTruncateLines(text: string, maxLines: number, maxChars = 320): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (!clean) return ''
  const lines = clean.split(/(?<=[.!?])\s+/)
  let out = lines.slice(0, maxLines).join(' ')
  if (lines.length > maxLines || clean.length > maxChars) {
    if (out.length > maxChars) out = `${out.slice(0, maxChars).trim()}…`
    else if (lines.length > maxLines) out = `${out}…`
  }
  return out
}

export function regiePlanSummaryDe(panel: FilmStoryboardPanel): string {
  const plan = panel.regiePlan
  if (plan?.cameraDe) {
    const bodies = plan.bodies.length ? plan.bodies.join(', ') : 'niemand'
  const place = plan.place ? `${plan.place} — ` : ''
    return `Regie: ${place}${plan.cameraDe} · Im Raum: ${bodies}`
  }
  if (panel.regiePlanError) return regiePlanErrorLineDe(panel.regiePlanError)
  return ''
}

export function attemptSummaryLineDe(attempt: RegieAttempt, index: number, compact: boolean): string {
  const planBit = attempt.planned ? 'nach Plan' : 'ohne Plan'
  const verdict = attempt.verdict?.unchecked
    ? attempt.verdict.noteDe
    : attempt.verdict?.ok
      ? 'passt'
      : attempt.verdict?.noteDe ?? 'nicht angeschaut'
  let line = `Versuch ${index + 1} — ${planBit} — Regie: ${verdict}`
  if (attempt.hintDe) line += ` · Hinweis: ${printTruncateLines(attempt.hintDe, 1, 120)}`
  if (compact && attempt.fixEn) {
    line += ` · Auftrag: ${printTruncateLines(attempt.fixEn, 4)}`
  } else if (!compact && attempt.fixEn) {
    line += ` · Auftrag: ${attempt.fixEn}`
  }
  if (attempt.copyOf) line += ' · fast gleich wie früheres Bild'
  return line
}

/** Grobe Seitenschätzung für den kompakten Druck (A4, wenig Rand). */
export function estimatePrintPages(panels: FilmStoryboardPanel[], verbose: boolean): number {
  let units = 0
  for (const panel of panels) {
    const attempts = panel.regieAttempts?.length ?? 0
    const refs = (panel.regieAttempts?.[attempts - 1]?.refs ?? panel.regiePlan?.refs ?? []).length
    units += verbose ? 1.35 + attempts * 0.55 + refs * 0.25 : 0.55 + attempts * 0.12 + refs * 0.04
  }
  return Math.max(1, Math.ceil(units))
}

export function estimatePrintPagesDe(panels: FilmStoryboardPanel[], verbose: boolean): string {
  const n = estimatePrintPages(panels, verbose)
  return `Ca. ${n} Seite${n === 1 ? '' : 'n'} (${verbose ? 'ausführlich' : 'kompakt'})`
}