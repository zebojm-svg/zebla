import type { SubscriptionStatus, UsageQuota, UserRole } from '../shared/types.js'

export const MASTER_EMAIL = (
  process.env.MASTER_EMAIL ?? 'zebojm@gmail.com'
)
  .trim()
  .toLowerCase()

/** Monatliche Kontingente. */
export const QUOTA_LIMITS: Record<UserRole, UsageQuota> = {
  master: { dialogCreates: 10_000, aiCalls: 10_000, slideshowPreps: 10_000 },
  teacher: { dialogCreates: 200, aiCalls: 500, slideshowPreps: 100 },
  student: { dialogCreates: 15, aiCalls: 40, slideshowPreps: 8 },
}

/** Lehrer ohne Abo: Bibliothek ja, KI nein. */
export const TEACHER_FREE_QUOTA: UsageQuota = {
  dialogCreates: 30,
  aiCalls: 0,
  slideshowPreps: 5,
}

export function resolveRole(
  authType: 'google' | 'student',
  email?: string | null,
): UserRole {
  if (authType === 'student') return 'student'
  if (email?.trim().toLowerCase() === MASTER_EMAIL) return 'master'
  return 'teacher'
}

export function isProActive(
  role: UserRole,
  subscriptionStatus: SubscriptionStatus,
): boolean {
  if (role === 'master') return true
  if (role === 'student') return true
  return subscriptionStatus === 'active'
}
