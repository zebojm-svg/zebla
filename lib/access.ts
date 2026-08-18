import { HttpError } from './api-utils.js'
import { getUserProfile, type UserProfile } from './firestore.js'
import type { UsageQuota, UserRole } from '../shared/types.js'
import {
  isProActive,
  QUOTA_LIMITS,
  TEACHER_FREE_QUOTA,
} from './roles.js'

export {
  MASTER_EMAIL,
  QUOTA_LIMITS,
  TEACHER_FREE_QUOTA,
  resolveRole,
  isProActive,
} from './roles.js'

export function quotaLimitsFor(profile: UserProfile): UsageQuota {
  if (profile.role === 'master') return QUOTA_LIMITS.master
  if (profile.role === 'teacher' && !isProActive(profile.role, profile.subscriptionStatus)) {
    return TEACHER_FREE_QUOTA
  }
  return QUOTA_LIMITS[profile.role]
}

export async function requireProfile(uid: string): Promise<UserProfile> {
  const profile = await getUserProfile(uid)
  if (!profile) throw new HttpError('Profil nicht gefunden.', 401)
  return profile
}

export async function requireRole(
  uid: string,
  roles: UserRole[],
): Promise<UserProfile> {
  const profile = await requireProfile(uid)
  if (!roles.includes(profile.role)) {
    throw new HttpError('Keine Berechtigung.', 403)
  }
  return profile
}

export function assertCanUseAi(profile: UserProfile): void {
  if (profile.role === 'master' || profile.role === 'student') return
  if (!isProActive(profile.role, profile.subscriptionStatus)) {
    throw new HttpError(
      'KI ist in der kostenlosen Lehrer-Version deaktiviert. Bitte Pro abonnieren.',
      402,
    )
  }
}
