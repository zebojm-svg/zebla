/** Welches Modell die Regie benutzt hat und warum — ohne KI, prüfbar im Check-Skript. */

export type RegieModelProblem = 'missing' | 'no-quota' | 'busy' | 'other'

/** HTTP-Status aus einer Google-Fehlermeldung («[429 Too Many Requests]», «"code": 503», «status: 404»). */
export function googleErrorStatus(message: string): number | undefined {
  const match =
    /\[(\d{3})(?:\s[^\]]*)?\]/.exec(message) ||
    /"code"\s*:\s*(\d{3})/.exec(message) ||
    /\bstatus(?:\s*code)?\s*[:=]?\s*(\d{3})\b/i.exec(message)
  const status = match ? Number(match[1]) : NaN
  return status >= 400 && status < 600 ? status : undefined
}

/**
 * Nur «Modell gibt es nicht / nicht für diesen Schlüssel» zählt als fehlend.
 * Überlastung (429/503) ist kein Fehlen — dann noch einmal Pro.
 */
export function regieModelProblem(message: string): RegieModelProblem {
  const status = googleErrorStatus(message)
  if (
    status === 404 ||
    /\bNOT_FOUND\b|is not found for API version|models\/[\w.-]+ is not found|UNKNOWN_MODEL|is not supported for generateContent/i.test(
      message,
    )
  ) {
    return 'missing'
  }
  if ((status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(message)) && /\blimit:\s*0\b/i.test(message)) {
    return 'no-quota'
  }
  if (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|try again later|fetch failed|ECONNRESET|socket hang up|ETIMEDOUT/i.test(
      message,
    )
  ) {
    return 'busy'
  }
  return 'other'
}

/** Google sagt manchmal, wann man wieder darf («Please retry in 12.5s», «retryDelay": "7s"»). */
export function googleRetryDelayMs(message: string): number | undefined {
  const match = /retry in\s*([\d.]+)\s*s/i.exec(message) || /retryDelay"?\s*:\s*"?([\d.]+)s/i.exec(message)
  if (!match) return undefined
  const seconds = Number(match[1])
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 1000) : undefined
}

/** Wartezeiten zwischen zwei Pro-Versuchen. */
export const REGIE_RETRY_WAITS_MS = [2_000, 6_000] as const

/** Ein neuer Pro-Versuch lohnt nur, wenn danach noch so viel Zeit bleibt. */
export const REGIE_RETRY_MIN_LEFT_MS = 30_000

/** Kurzer Name fürs Modell: «Pro», «Flash» oder der Name selbst. */
export function regieModelNameDe(model: string): string {
  if (/pro/i.test(model)) return 'Pro'
  if (/flash/i.test(model)) return 'Flash'
  return model
}

/** «Flash statt Pro, weil …» — Satz für Urteil, Plan und Regiebuch. */
export function regieFallbackDe(
  problem: 'missing' | 'no-quota',
  wanted: string,
  used: string,
  status?: number,
): string {
  const head = `${regieModelNameDe(used)} statt ${regieModelNameDe(wanted)}, weil`
  if (problem === 'no-quota') {
    return `${head} der Google-Schlüssel für ${wanted} kein Kontingent hat${status ? ` (${status})` : ''}. Abrechnung in Google AI Studio prüfen.`
  }
  return `${head} Google ${wanted} mit diesem Schlüssel nicht kennt${status ? ` (${status})` : ''}. Modellname oder Schlüssel in Vercel prüfen.`
}

/** In Vercel ist ein anderes Regie-Modell eingestellt. */
export function regieEnvNoteDe(model: string): string {
  return `In Vercel ist GEMINI_REGIE_MODEL = ${model} eingestellt (nicht Pro).`
}

/** Pro war zu oft überlastet — keine Antwort, aber ehrlich warum. */
export function regieBusyDe(model: string, tries: number, status?: number): string {
  return `${regieModelNameDe(model)} war ${tries}× überlastet${status ? ` (${status})` : ''}. Bitte später noch einmal.`
}

/** Eine Zeile für den Verlauf: «Modell: gemini-2.5-pro» oder mit Grund. */
export function regieModelLineDe(model?: string, noteDe?: string): string {
  if (!model) return ''
  return noteDe ? `Modell: ${model} — ${noteDe}` : `Modell: ${model}`
}
