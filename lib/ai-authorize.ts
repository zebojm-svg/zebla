import { HttpError } from './api-utils.js'
import { currentAiContext, teacherForProfile } from './ai-usage-ledger.js'
import { getUserProfile, type UserProfile } from './firestore.js'
import { MASTER_EMAIL } from './roles.js'

/**
 * Fragt VOR jedem Gemini-/TTS-Aufruf beim Hub nach, ob KI erlaubt ist
 * (POST /api/ai/authorize, gleiches Secret wie das Verbrauchsbuch).
 * Lehrpersonen per E-Mail, Schüler über die Lehrperson ihrer Klasse.
 * Positive Antworten 60 s pro Konto gecacht. Hub nicht erreichbar → gesperrt, ausser Master.
 */
const DEFAULT_ENDPOINT = 'https://zebotools.ch/api/ai/authorize'
const CACHE_MS = 60_000

export const AI_LOCKED_TEACHER_MSG =
  'KI ist für dein Konto noch nicht freigeschaltet. Bitte wende dich an ZeboTools.'
export const AI_LOCKED_STUDENT_MSG =
  'KI ist für dein Konto noch nicht freigeschaltet. Bitte wende dich an deine Lehrperson.'

const allowedUntil = new Map<string, number>()

function endpoint(): string {
  const custom = process.env.AI_AUTHORIZE_ENDPOINT?.trim()
  if (custom) return custom
  const usage = process.env.AI_USAGE_ENDPOINT?.trim()
  return usage ? usage.replace(/\/api\/ai-usage\/?$/, '/api/ai/authorize') : DEFAULT_ENDPOINT
}

async function isAiAllowed(profile: UserProfile, feature: string): Promise<boolean> {
  const now = Date.now()
  if ((allowedUntil.get(profile.id) ?? 0) > now) return true
  const teacher = await teacherForProfile(profile)
  const master = profile.role === 'master' || teacher?.email === MASTER_EMAIL
  const secret = process.env.AI_USAGE_INGEST_SECRET?.trim()
  if (!secret) return master
  const student = profile.role === 'student'
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        app: 'zebla',
        feature,
        teacherEmail: teacher?.email ?? null,
        studentId: student ? profile.id : null,
        classId: student ? (profile.classIds[0] ?? null) : null,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      console.warn('ai-authorize', res.status)
      return master
    }
    const data = (await res.json()) as { allowed?: unknown }
    if (data.allowed === true) {
      allowedUntil.set(profile.id, now + CACHE_MS)
      return true
    }
    return false
  } catch (e) {
    console.warn('ai-authorize', e instanceof Error ? e.message : e)
    return master
  } finally {
    clearTimeout(timer)
  }
}

export async function assertAiAllowedFor(profile: UserProfile, feature?: string): Promise<void> {
  if (await isAiAllowed(profile, feature ?? currentAiContext()?.feature ?? 'unknown')) return
  throw new HttpError(profile.role === 'student' ? AI_LOCKED_STUDENT_MSG : AI_LOCKED_TEACHER_MSG, 403)
}

/**
 * Unmittelbar vor einem Gemini-/TTS-Aufruf. Ohne Request-Kontext (lokale Skripte) nur ausserhalb von Vercel erlaubt.
 */
export async function assertAiAllowed(): Promise<void> {
  const ctx = currentAiContext()
  if (!ctx) {
    if (process.env.VERCEL) throw new HttpError(AI_LOCKED_TEACHER_MSG, 403)
    return
  }
  const profile = ctx.profile ?? (ctx.uid ? await getUserProfile(ctx.uid).catch(() => null) : null)
  if (!profile) throw new HttpError(AI_LOCKED_TEACHER_MSG, 403)
  await assertAiAllowedFor(profile, ctx.feature)
}
