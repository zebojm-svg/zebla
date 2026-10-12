import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { UserProfile } from './firestore.js'

/**
 * Meldet jeden Gemini-Aufruf ans zentrale Verbrauchsbuch im Hub (nur Metadaten: App, Funktion,
 * Modell, Tokens, Lehrperson — nie Prompt-Inhalte oder Schülernamen).
 * Fire-and-forget: Fehler hier dürfen den KI-Aufruf nie beeinträchtigen.
 * Env: AI_USAGE_INGEST_SECRET (Pflicht), AI_USAGE_ENDPOINT (optional).
 *
 * Zebla hat ein eigenes Firebase-Projekt: Lehrpersonen werden per E-Mail gemeldet (der Hub löst
 * daraus die kanonische Hub-ID auf), Schüler-Aufrufe der Lehrperson ihrer Klasse zugeordnet.
 */
const DEFAULT_ENDPOINT = 'https://zebotools.ch/api/ai-usage'

type AiUsageContext = {
  feature: string
  profile: UserProfile | null
  uid: string | null
  /** KI-Punkte: einmal pro Request (= Klick) beim Hub reserviert, danach alle KI-Aufrufe darauf. */
  authorized?: boolean
  reservationId?: string | null
  settled?: boolean
}

const store = new AsyncLocalStorage<AiUsageContext>()

/** Zu Beginn eines API-Requests: Funktion (API-Route) für alle folgenden Gemini-Aufrufe. */
export function meterAiRequest(feature: string): void {
  try {
    store.enterWith({ feature: feature.slice(0, 50) || 'unknown', profile: null, uid: null })
  } catch {
    // Verbrauchsbuch ist optional.
  }
}

/** Nach der Profil-Prüfung: wer den Aufruf auslöst. */
export function meterAiProfile(profile: UserProfile): void {
  const ctx = store.getStore()
  if (ctx) ctx.profile = profile
}

/** Nach der Anmeldung: UID für die KI-Freischaltung, falls die Route kein Profil lädt. */
export function meterAiUser(uid: string): void {
  const ctx = store.getStore()
  if (ctx && !ctx.uid) ctx.uid = uid
}

export function currentAiContext(): AiUsageContext | undefined {
  return store.getStore()
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

type Teacher = { email: string | null; appUserId: string | null }

const teacherByClass = new Map<string, Teacher | null>()

export async function teacherForProfile(profile: UserProfile | null): Promise<Teacher | null> {
  if (!profile) return null
  if (profile.role !== 'student') {
    return { email: profile.email?.trim().toLowerCase() || null, appUserId: profile.id }
  }
  const classId = profile.classIds[0]
  if (!classId) return null
  if (teacherByClass.has(classId)) return teacherByClass.get(classId) ?? null
  let teacher: Teacher | null = null
  try {
    const { getClass } = await import('./classes.js')
    const { getUserProfile } = await import('./firestore.js')
    const teacherId = (await getClass(classId))?.teacherId
    if (teacherId) {
      const tp = await getUserProfile(teacherId)
      teacher = { email: tp?.email?.trim().toLowerCase() || null, appUserId: teacherId }
    }
  } catch {
    teacher = null
  }
  teacherByClass.set(classId, teacher)
  return teacher
}

async function send(ctx: AiUsageContext | undefined, rec: Record<string, unknown>): Promise<void> {
  const secret = process.env.AI_USAGE_INGEST_SECRET?.trim()
  if (!secret) return
  const endpoint = process.env.AI_USAGE_ENDPOINT?.trim() || DEFAULT_ENDPOINT
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4000)
  try {
    const teacher = await teacherForProfile(ctx?.profile ?? null)
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        app: 'zebla',
        ...rec,
        teacherEmail: teacher?.email ?? null,
        appUserId: teacher?.appUserId ?? null,
        ...(ctx?.reservationId ? { reservationId: ctx.reservationId } : {}),
        eventId: randomUUID(),
        at: new Date().toISOString(),
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) console.warn('ai-usage ledger', res.status)
  } catch (e) {
    console.warn('ai-usage ledger', e instanceof Error ? e.message : e)
  } finally {
    clearTimeout(timer)
  }
}

/** Vercel hält die Funktion für diese Promise am Leben, ohne die Antwort zu verzögern. */
export function waitUntil(p: Promise<unknown>): void {
  const ctx = (
    globalThis as { [k: symbol]: { get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined }
  )[Symbol.for('@vercel/request-context')]?.get?.()
  if (ctx?.waitUntil) ctx.waitUntil(p)
  else void p
}

/**
 * Einen erfolgreichen Gemini-Aufruf melden. `kind` unterscheidet Teilschritte (text, image, tts, …).
 * `usage` = usageMetadata der Antwort (fehlt bei Imagen/Cloud-TTS → Aufruf wird ohne Tokens gezählt).
 * `units` = Menge für die Kostenschätzung im Hub, falls Tokens fehlen (Bilder, Audiosekunden).
 */
export type AiUsageUnits = { units: number; unitType: 'image' | 'request' | 'audio_second' }

export function recordGeminiUsage(kind: string, model: string, usage: unknown, units?: AiUsageUnits): void {
  try {
    const ctx = store.getStore()
    const u = (usage ?? {}) as Record<string, unknown>
    waitUntil(
      send(ctx, {
        feature: `${ctx?.feature ?? 'unknown'}/${kind}`,
        model: model.replace(/^models\//, ''),
        inputTokens: num(u.promptTokenCount),
        outputTokens: num(u.candidatesTokenCount) + num(u.thoughtsTokenCount),
        ...(units ?? {}),
      }),
    )
  } catch {
    // Verbrauchsbuch darf den KI-Aufruf nie stören.
  }
}

/** Für rohe REST-Antworten von `:generateContent` (usageMetadata/modelVersion aus dem JSON). */
export function recordGeminiResponse(kind: string, model: string, data: unknown): void {
  const d = (data ?? {}) as { usageMetadata?: unknown; modelVersion?: unknown }
  const version = typeof d.modelVersion === 'string' && d.modelVersion ? d.modelVersion : model
  recordGeminiUsage(kind, version, d.usageMetadata)
}
