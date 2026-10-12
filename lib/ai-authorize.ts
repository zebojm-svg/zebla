import { HttpError } from './api-utils.js'
import { currentAiContext, teacherForProfile, waitUntil } from './ai-usage-ledger.js'
import { getUserProfile, type UserProfile } from './firestore.js'
import { MASTER_EMAIL } from './roles.js'

/**
 * KI-Punkte: beim ersten KI-Aufruf eines Requests (= ein Klick) beim Hub Punkte reservieren
 * (POST /api/ai/authorize, gleiches Secret wie das Verbrauchsbuch). Alle weiteren Gemini-/TTS-/FLUX-
 * Aufrufe desselben Requests laufen auf diese Reservation; am Ende gibt settleAiRequest() den Rest frei.
 * Lehrpersonen per E-Mail, Schüler über die Lehrperson ihrer Klasse.
 * Hub nicht erreichbar → gesperrt, ausser Master.
 */
const DEFAULT_BASE = 'https://zebotools.ch'

export const AI_LOCKED_TEACHER_MSG =
  'KI ist für dein Konto noch nicht freigeschaltet. Bitte wende dich an ZeboTools.'
export const AI_LOCKED_STUDENT_MSG =
  'KI ist für dein Konto noch nicht freigeschaltet. Bitte wende dich an deine Lehrperson.'
export const AI_HUB_DOWN_MSG =
  'Die KI-Punkte konnten nicht geprüft werden. Bitte in einer Minute nochmals versuchen.'

export type AiQuote = {
  allowed?: boolean
  reason?: string
  message?: string | null
  reservationId?: string | null
  balance?: number | null
  estimatedCost?: number | null
  unlimited?: boolean
  features?: Record<string, number>
}

function hubUrl(path: string): string {
  const custom = process.env.AI_AUTHORIZE_ENDPOINT?.trim()
  if (custom && path === '/api/ai/authorize') return custom
  const usage = process.env.AI_USAGE_ENDPOINT?.trim()
  const base = usage ? usage.replace(/\/api\/ai-usage\/?$/, '') : DEFAULT_BASE
  return `${base}${path}`
}

async function hubPost<T>(path: string, body: Record<string, unknown>, timeoutMs = 5000): Promise<T | null> {
  const secret = process.env.AI_USAGE_INGEST_SECRET?.trim()
  if (!secret) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(hubUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ app: 'zebla', ...body }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      console.warn('hub', path, res.status)
      return null
    }
    return (await res.json()) as T
  } catch (e) {
    console.warn('hub', path, e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function walletContext(profile: UserProfile) {
  const teacher = await teacherForProfile(profile)
  const student = profile.role === 'student'
  return {
    master: profile.role === 'master' || teacher?.email === MASTER_EMAIL,
    body: {
      teacherEmail: teacher?.email ?? null,
      studentId: student ? profile.id : null,
      classId: student ? (profile.classIds[0] ?? null) : null,
    },
  }
}

function lockedMessage(profile: UserProfile): string {
  return profile.role === 'student' ? AI_LOCKED_STUDENT_MSG : AI_LOCKED_TEACHER_MSG
}

/** Kostenvorschau ohne Reservation (für «Kostet ca. X KI-Punkte · du hast noch Y»). */
export async function quoteAiFor(profile: UserProfile, features: string[]): Promise<AiQuote | null> {
  const { body } = await walletContext(profile)
  return hubPost<AiQuote>('/api/ai/estimate', { ...body, features })
}

export async function assertAiAllowedFor(profile: UserProfile, feature?: string): Promise<void> {
  const ctx = currentAiContext()
  if (ctx?.authorized) return
  const { master, body } = await walletContext(profile)
  const data = await hubPost<AiQuote>('/api/ai/authorize', {
    ...body,
    feature: feature ?? ctx?.feature ?? 'unknown',
  })
  if (!data) {
    if (!master) throw new HttpError(process.env.AI_USAGE_INGEST_SECRET ? AI_HUB_DOWN_MSG : lockedMessage(profile), 403)
  } else if (data.allowed !== true) {
    throw new HttpError(data.message ?? lockedMessage(profile), 403)
  }
  if (ctx) {
    ctx.authorized = true
    ctx.reservationId = data?.reservationId ?? null
  }
}

/**
 * Unmittelbar vor einem Gemini-/TTS-/FLUX-Aufruf. Ohne Request-Kontext (lokale Skripte) nur ausserhalb von Vercel erlaubt.
 */
export async function assertAiAllowed(): Promise<void> {
  const ctx = currentAiContext()
  if (!ctx) {
    if (process.env.VERCEL) throw new HttpError(AI_LOCKED_TEACHER_MSG, 403)
    return
  }
  if (ctx.authorized) return
  const profile = ctx.profile ?? (ctx.uid ? await getUserProfile(ctx.uid).catch(() => null) : null)
  if (!profile) throw new HttpError(AI_LOCKED_TEACHER_MSG, 403)
  await assertAiAllowedFor(profile, ctx.feature)
}

/** Am Ende des Requests: nicht verbrauchten Rest freigeben (kurz verzögert, damit die Verbrauchsmeldungen zuerst ankommen). */
export function settleAiRequest(delayMs = 1500): void {
  const ctx = currentAiContext()
  const reservationId = ctx?.reservationId
  if (!ctx || !reservationId || ctx.settled) return
  ctx.settled = true
  waitUntil(
    (async () => {
      await new Promise((r) => setTimeout(r, delayMs))
      await hubPost('/api/ai/settle', { reservationId })
    })(),
  )
}
