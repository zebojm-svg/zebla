import { randomUUID } from 'crypto'
import { adminAuth, adminDb } from './firebase-admin.js'
import type { Dialog, DialogSection } from '../shared/types.js'

export interface UserProfile {
  id: string
  name: string
  email?: string
  authType: 'google' | 'student'
  createdAt: string
}

interface DialogDoc {
  userId: string
  title: string
  sourceLanguage: string
  targetLanguage: string
  length: Dialog['length']
  sections: DialogSection[]
  folderId?: string | null
  shareToken?: string | null
  createdAt: string
  updatedAt: string
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      if (val !== undefined) out[key] = stripUndefined(val)
    }
    return out as T
  }
  return value
}

function sanitizeSections(sections: DialogSection[]): DialogSection[] {
  return stripUndefined(sections)
}

function docToDialog(id: string, data: DialogDoc): Dialog {
  return {
    id,
    userId: data.userId,
    title: data.title,
    sourceLanguage: data.sourceLanguage,
    targetLanguage: data.targetLanguage,
    length: data.length,
    sections: sanitizeSections(data.sections),
    folderId: data.folderId ?? null,
    shareToken: data.shareToken ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await adminDb().collection('users').doc(uid).get()
  if (!snap.exists) return null
  const data = snap.data()!
  return {
    id: uid,
    name: data.name as string,
    email: data.email as string | undefined,
    authType: data.authType as 'google' | 'student',
    createdAt: data.createdAt as string,
  }
}

export async function upsertUserProfile(
  uid: string,
  data: { name: string; email?: string; authType: 'google' | 'student' },
): Promise<UserProfile> {
  const ref = adminDb().collection('users').doc(uid)
  const existing = await ref.get()
  const now = new Date().toISOString()

  if (existing.exists) {
    await ref.update({
      name: data.name,
      ...(data.email ? { email: data.email } : {}),
    })
    const updated = await ref.get()
    const d = updated.data()!
    return {
      id: uid,
      name: d.name as string,
      email: d.email as string | undefined,
      authType: d.authType as 'google' | 'student',
      createdAt: d.createdAt as string,
    }
  }

  const profile = {
    name: data.name,
    email: data.email ?? null,
    authType: data.authType,
    createdAt: now,
  }
  await ref.set(profile)
  return {
    id: uid,
    name: data.name,
    email: data.email,
    authType: data.authType,
    createdAt: now,
  }
}

export async function loginWithStudentCode(
  code: string,
  displayName?: string,
): Promise<{ uid: string; profile: UserProfile; customToken: string }> {
  const normalized = code.toUpperCase().trim()
  const codeRef = adminDb().collection('studentCodes').doc(normalized)
  const codeSnap = await codeRef.get()

  if (!codeSnap.exists) {
    throw new Error('Ungültiger Schülercode.')
  }

  const codeData = codeSnap.data()!
  let uid = codeData.userId as string | undefined
  const name = displayName?.trim() || `Schüler ${normalized.slice(-4)}`

  if (!uid) {
    uid = randomUUID()
    await adminAuth().createUser({ uid, displayName: name })
    await codeRef.update({ userId: uid })
    const profile = await upsertUserProfile(uid, { name, authType: 'student' })
    const customToken = await adminAuth().createCustomToken(uid)
    return { uid, profile, customToken }
  }

  const profile = await getUserProfile(uid)
  if (!profile) {
    await upsertUserProfile(uid, { name, authType: 'student' })
  } else if (displayName?.trim()) {
    await upsertUserProfile(uid, { name: displayName.trim(), authType: 'student' })
  }

  const finalProfile = (await getUserProfile(uid))!
  const customToken = await adminAuth().createCustomToken(uid)
  return { uid, profile: finalProfile, customToken }
}

export async function listDialogs(userId: string): Promise<Dialog[]> {
  const snap = await adminDb()
    .collection('dialogs')
    .where('userId', '==', userId)
    .orderBy('updatedAt', 'desc')
    .get()

  return snap.docs.map((doc) => docToDialog(doc.id, doc.data() as DialogDoc))
}

export async function getDialog(id: string, userId: string): Promise<Dialog | null> {
  const snap = await adminDb().collection('dialogs').doc(id).get()
  if (!snap.exists) return null
  const data = snap.data() as DialogDoc
  if (data.userId !== userId) return null
  return docToDialog(snap.id, data)
}

export async function createDialog(
  userId: string,
  data: {
    title: string
    sourceLanguage: string
    targetLanguage: string
    length: Dialog['length']
    sections: DialogSection[]
    folderId?: string | null
  },
): Promise<Dialog> {
  const now = new Date().toISOString()
  const doc: DialogDoc = {
    userId,
    title: data.title,
    sourceLanguage: data.sourceLanguage,
    targetLanguage: data.targetLanguage,
    length: data.length,
    sections: sanitizeSections(data.sections),
    folderId: data.folderId ?? null,
    createdAt: now,
    updatedAt: now,
  }
  const ref = await adminDb().collection('dialogs').add(doc)
  return docToDialog(ref.id, doc)
}

export async function updateDialog(
  id: string,
  userId: string,
  data: Partial<{
    title: string
    sourceLanguage: string
    targetLanguage: string
    sections: DialogSection[]
    folderId: string | null
  }>,
): Promise<Dialog | null> {
  const existing = await getDialog(id, userId)
  if (!existing) return null

  const updated: DialogDoc = {
    userId,
    title: data.title ?? existing.title,
    sourceLanguage: data.sourceLanguage ?? existing.sourceLanguage,
    targetLanguage: data.targetLanguage ?? existing.targetLanguage,
    length: existing.length,
    sections: sanitizeSections(data.sections ?? existing.sections),
    folderId: data.folderId !== undefined ? data.folderId : (existing.folderId ?? null),
    shareToken: existing.shareToken ?? null,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  }

  await adminDb().collection('dialogs').doc(id).set(updated)
  return docToDialog(id, updated)
}

export async function deleteDialog(id: string, userId: string): Promise<boolean> {
  const existing = await getDialog(id, userId)
  if (!existing) return false
  await adminDb().collection('dialogs').doc(id).delete()
  return true
}

export async function getDialogByShareToken(token: string): Promise<Dialog | null> {
  const snap = await adminDb()
    .collection('dialogs')
    .where('shareToken', '==', token)
    .limit(1)
    .get()
  if (snap.empty) return null
  const doc = snap.docs[0]
  return docToDialog(doc.id, doc.data() as DialogDoc)
}

export async function setDialogSharing(
  id: string,
  userId: string,
  enabled: boolean,
): Promise<Dialog | null> {
  const existing = await getDialog(id, userId)
  if (!existing) return null

  const shareToken = enabled ? randomUUID() : null
  await adminDb()
    .collection('dialogs')
    .doc(id)
    .update({
      shareToken,
      updatedAt: new Date().toISOString(),
    })

  return { ...existing, shareToken, updatedAt: new Date().toISOString() }
}

export async function cloneDialog(
  source: Dialog,
  userId: string,
  folderId?: string | null,
): Promise<Dialog> {
  const now = new Date().toISOString()
  const doc: DialogDoc = {
    userId,
    title: `${source.title} (Kopie)`,
    sourceLanguage: source.sourceLanguage,
    targetLanguage: source.targetLanguage,
    length: source.length,
    sections: sanitizeSections(JSON.parse(JSON.stringify(source.sections)) as DialogSection[]),
    folderId: folderId ?? null,
    createdAt: now,
    updatedAt: now,
  }
  const ref = await adminDb().collection('dialogs').add(doc)
  return docToDialog(ref.id, doc)
}

export async function seedStudentCodes(codes: string[]): Promise<void> {
  const batch = adminDb().batch()
  for (const code of codes) {
    const ref = adminDb().collection('studentCodes').doc(code)
    batch.set(
      ref,
      {
        label: `Demo-Code ${code}`,
        createdAt: new Date().toISOString(),
      },
      { merge: true },
    )
  }
  await batch.commit()
}
