import { adminDb } from './firebase-admin.js'
import type { UsageQuota } from '../shared/types.js'
import type { UserProfile } from './firestore.js'
import { quotaLimitsFor } from './access.js'
import { HttpError } from './api-utils.js'

function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

type QuotaField = keyof UsageQuota

export async function getUsage(uid: string): Promise<UsageQuota> {
  const snap = await adminDb()
    .collection('usage')
    .doc(uid)
    .collection('months')
    .doc(monthKey())
    .get()
  if (!snap.exists) {
    return { dialogCreates: 0, aiCalls: 0, slideshowPreps: 0 }
  }
  const d = snap.data()!
  return {
    dialogCreates: (d.dialogCreates as number) ?? 0,
    aiCalls: (d.aiCalls as number) ?? 0,
    slideshowPreps: (d.slideshowPreps as number) ?? 0,
  }
}

export async function remainingQuota(profile: UserProfile): Promise<UsageQuota> {
  const used = await getUsage(profile.id)
  const limits = quotaLimitsFor(profile)
  return {
    dialogCreates: Math.max(0, limits.dialogCreates - used.dialogCreates),
    aiCalls: Math.max(0, limits.aiCalls - used.aiCalls),
    slideshowPreps: Math.max(0, limits.slideshowPreps - used.slideshowPreps),
  }
}

export async function consumeQuota(
  profile: UserProfile,
  field: QuotaField,
  amount = 1,
): Promise<void> {
  const limits = quotaLimitsFor(profile)
  const ref = adminDb()
    .collection('usage')
    .doc(profile.id)
    .collection('months')
    .doc(monthKey())

  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const current = snap.exists
      ? ((snap.data()?.[field] as number) ?? 0)
      : 0
    if (current + amount > limits[field]) {
      throw new HttpError(
        `Kontingent erschöpft (${field}). Pro-Abo oder nächsten Monat abwarten.`,
        402,
      )
    }
    tx.set(
      ref,
      {
        [field]: current + amount,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    )
  })
}
