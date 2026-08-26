import { randomUUID } from 'crypto'
import { adminAuth, adminDb } from './firebase-admin.js'
import type {
  CharacterVisual,
  Dialog,
  DialogSection,
  DialogVisualScript,
  SubscriptionStatus,
  UserRole,
} from '../shared/types.js'
import { isProActive, resolveRole } from './roles.js'
import { getClassByCode, getClass } from './classes.js'
import { getFolder } from './folders.js'

export interface UserProfile {
  id: string
  name: string
  email?: string
  authType: 'google' | 'student'
  role: UserRole
  classIds: string[]
  subscriptionStatus: SubscriptionStatus
  stripeCustomerId?: string
  stripeSubscriptionId?: string
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
  classId?: string | null
  shareToken?: string | null
  creationMode?: Dialog['creationMode']
  creationPrompt?: string
  creationChat?: Dialog['creationChat']
  imageDirection?: string
  filmPrompt?: string
  filmPlan?: Dialog['filmPlan']
  soundDirection?: string
  speechDirection?: string
  filmStoryboard?: Dialog['filmStoryboard']
  referenceImageUrl?: string
  referenceImagePrompt?: string
  speakerProfiles?: Dialog['speakerProfiles']
  characterBible?: CharacterVisual[]
  speakerVoices?: Dialog['speakerVoices']
  visualScript?: DialogVisualScript
  visualBrief?: Dialog['visualBrief']
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
    classId: data.classId ?? null,
    shareToken: data.shareToken ?? null,
    creationMode: data.creationMode,
    creationPrompt: data.creationPrompt,
    creationChat: data.creationChat,
    imageDirection: data.imageDirection,
    filmPrompt: data.filmPrompt,
    filmPlan: data.filmPlan ?? null,
    soundDirection: data.soundDirection,
    speechDirection: data.speechDirection,
    filmStoryboard: data.filmStoryboard ?? null,
    referenceImageUrl: data.referenceImageUrl,
    referenceImagePrompt: data.referenceImagePrompt,
    speakerProfiles: data.speakerProfiles,
    characterBible: data.characterBible,
    speakerVoices: data.speakerVoices,
    visualScript: data.visualScript,
    visualBrief: data.visualBrief ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

function mapProfile(uid: string, data: Record<string, unknown>): UserProfile {
  const authType = (data.authType as 'google' | 'student') ?? 'google'
  const email = data.email as string | undefined
  const role = (data.role as UserRole) ?? resolveRole(authType, email)
  const subscriptionStatus =
    (data.subscriptionStatus as SubscriptionStatus) ?? 'none'
  return {
    id: uid,
    name: data.name as string,
    email,
    authType,
    role,
    classIds: Array.isArray(data.classIds) ? (data.classIds as string[]) : [],
    subscriptionStatus,
    stripeCustomerId: data.stripeCustomerId as string | undefined,
    stripeSubscriptionId: data.stripeSubscriptionId as string | undefined,
    createdAt: data.createdAt as string,
  }
}

export function profileToClientUser(profile: UserProfile) {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    authType: profile.authType,
    role: profile.role,
    classIds: profile.classIds,
    subscriptionStatus: profile.subscriptionStatus,
    proActive: isProActive(profile.role, profile.subscriptionStatus),
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await adminDb().collection('users').doc(uid).get()
  if (!snap.exists) return null
  return mapProfile(uid, snap.data() as Record<string, unknown>)
}

export async function upsertUserProfile(
  uid: string,
  data: {
    name: string
    email?: string
    authType: 'google' | 'student'
    classIds?: string[]
  },
): Promise<UserProfile> {
  const ref = adminDb().collection('users').doc(uid)
  const existing = await ref.get()
  const now = new Date().toISOString()
  const role = resolveRole(data.authType, data.email)

  if (existing.exists) {
    const prev = existing.data()!
    const updates: Record<string, unknown> = {
      name: data.name,
      role,
      ...(data.email ? { email: data.email } : {}),
    }
    // Master-E-Mail nachträglich erkannt
    if (role === 'master' && prev.role !== 'master') {
      updates.subscriptionStatus = 'active'
    }
    if (data.classIds) {
      updates.classIds = data.classIds
    }
    await ref.update(updates)
    const updated = await ref.get()
    return mapProfile(uid, updated.data() as Record<string, unknown>)
  }

  const profile = {
    name: data.name,
    email: data.email ?? null,
    authType: data.authType,
    role,
    classIds: data.classIds ?? [],
    subscriptionStatus: role === 'master' ? 'active' : 'none',
    createdAt: now,
  }
  await ref.set(profile)
  return mapProfile(uid, profile as Record<string, unknown>)
}

export async function setUserSubscription(
  uid: string,
  data: {
    subscriptionStatus: SubscriptionStatus
    stripeCustomerId?: string
    stripeSubscriptionId?: string | null
  },
): Promise<UserProfile | null> {
  const ref = adminDb().collection('users').doc(uid)
  const snap = await ref.get()
  if (!snap.exists) return null
  await ref.update({
    subscriptionStatus: data.subscriptionStatus,
    ...(data.stripeCustomerId ? { stripeCustomerId: data.stripeCustomerId } : {}),
    ...(data.stripeSubscriptionId !== undefined
      ? { stripeSubscriptionId: data.stripeSubscriptionId }
      : {}),
  })
  const updated = await ref.get()
  return mapProfile(uid, updated.data() as Record<string, unknown>)
}

export async function loginWithStudentCode(
  studentCode: string,
  displayName?: string,
  classCode?: string,
): Promise<{ uid: string; profile: UserProfile; customToken: string }> {
  const normalized = studentCode.toUpperCase().trim()
  const codeRef = adminDb().collection('studentCodes').doc(normalized)
  const codeSnap = await codeRef.get()

  if (!codeSnap.exists) {
    throw new Error('Ungültiger Schülercode.')
  }

  const codeData = codeSnap.data()!
  const codeClassId = codeData.classId as string | undefined

  if (classCode?.trim()) {
    const classroom = await getClassByCode(classCode)
    if (!classroom) throw new Error('Ungültiger Klassencode.')
    if (codeClassId && codeClassId !== classroom.id) {
      throw new Error('Schülercode gehört nicht zu dieser Klasse.')
    }
  } else if (!codeClassId) {
    // Legacy-Demo-Codes ohne Klasse weiter erlauben
  } else {
    throw new Error('Bitte auch den Klassencode eingeben.')
  }

  let uid = codeData.userId as string | undefined
  const name = displayName?.trim() || `Schüler ${normalized.slice(-4)}`
  const classIds = codeClassId ? [codeClassId] : []

  if (!uid) {
    uid = randomUUID()
    await adminAuth().createUser({ uid, displayName: name })
    await codeRef.update({ userId: uid })
    const profile = await upsertUserProfile(uid, {
      name,
      authType: 'student',
      classIds,
    })
    const customToken = await adminAuth().createCustomToken(uid)
    return { uid, profile, customToken }
  }

  const profile = await getUserProfile(uid)
  if (!profile) {
    await upsertUserProfile(uid, { name, authType: 'student', classIds })
  } else {
    await upsertUserProfile(uid, {
      name: displayName?.trim() || profile.name,
      authType: 'student',
      classIds: classIds.length ? classIds : profile.classIds,
    })
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

export async function listDialogsForClassIds(classIds: string[]): Promise<Dialog[]> {
  if (!classIds.length) return []
  const dialogs: Dialog[] = []
  for (const classId of [...new Set(classIds)]) {
    const snap = await adminDb()
      .collection('dialogs')
      .where('classId', '==', classId)
      .get()
    for (const doc of snap.docs) {
      dialogs.push(docToDialog(doc.id, doc.data() as DialogDoc))
    }
  }
  return dialogs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

async function canAccessDialog(
  data: DialogDoc,
  userId: string,
  profile?: UserProfile | null,
): Promise<boolean> {
  if (data.userId === userId) return true
  if (profile?.role === 'master') return true
  if (!data.classId) return false
  if (profile?.classIds.includes(data.classId)) return true
  const classroom = await getClass(data.classId)
  return !!classroom && classroom.teacherId === userId
}

export async function getDialog(
  id: string,
  userId: string,
  profile?: UserProfile | null,
): Promise<Dialog | null> {
  const snap = await adminDb().collection('dialogs').doc(id).get()
  if (!snap.exists) return null
  const data = snap.data() as DialogDoc
  if (!(await canAccessDialog(data, userId, profile))) return null
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
    classId?: string | null
    creationMode?: Dialog['creationMode']
    creationPrompt?: string
    creationChat?: Dialog['creationChat']
    imageDirection?: string
    filmPrompt?: string
    soundDirection?: string
    speechDirection?: string
    referenceImageUrl?: string
    referenceImagePrompt?: string
    speakerProfiles?: Dialog['speakerProfiles']
  },
): Promise<Dialog> {
  let classId = data.classId ?? null
  if (data.folderId) {
    const folder = await getFolder(data.folderId)
    if (folder?.scope === 'class') {
      classId = folder.classId ?? null
    }
  }

  const now = new Date().toISOString()
  const doc: DialogDoc = {
    userId,
    title: data.title,
    sourceLanguage: data.sourceLanguage,
    targetLanguage: data.targetLanguage,
    length: data.length,
    sections: sanitizeSections(data.sections),
    folderId: data.folderId ?? null,
    classId,
    creationMode: data.creationMode,
    creationPrompt: data.creationPrompt,
    creationChat: data.creationChat,
    imageDirection: data.imageDirection,
    filmPrompt: data.filmPrompt,
    soundDirection: data.soundDirection,
    speechDirection: data.speechDirection,
    referenceImageUrl: data.referenceImageUrl,
    referenceImagePrompt: data.referenceImagePrompt,
    speakerProfiles: data.speakerProfiles,
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
    creationMode: Dialog['creationMode']
    creationPrompt: string
    creationChat: Dialog['creationChat']
    imageDirection: string
    filmPrompt: string
    filmPlan: Dialog['filmPlan']
    soundDirection: string
    speechDirection: string
    filmStoryboard: Dialog['filmStoryboard']
    /** null = Feld löschen (z. B. bei Bild-Neuaufbau). */
    referenceImageUrl: string | null
    referenceImagePrompt: string | null
    speakerProfiles: Dialog['speakerProfiles']
    characterBible: CharacterVisual[]
    speakerVoices: Dialog['speakerVoices']
    visualScript: DialogVisualScript | null
    visualBrief: Dialog['visualBrief']
  }>,
  profile?: UserProfile | null,
): Promise<Dialog | null> {
  const existing = await getDialog(id, userId, profile)
  if (!existing) return null

  const isOwner = existing.userId === userId
  let isClassTeacher = profile?.role === 'master'
  if (!isOwner && existing.classId) {
    const classroom = await getClass(existing.classId)
    isClassTeacher = isClassTeacher || (!!classroom && classroom.teacherId === userId)
  }
  if (!isOwner && !isClassTeacher) return null

  // Nur Eigentümer oder Klassenlehrer (via canAccess) dürfen speichern;
  // Owner bleibt der ursprüngliche userId.
  let folderId = data.folderId !== undefined ? data.folderId : (existing.folderId ?? null)
  let classId = existing.classId ?? null
  if (data.folderId !== undefined) {
    if (data.folderId) {
      const folder = await getFolder(data.folderId)
      if (!folder) throw new Error('Zielordner nicht gefunden.')
      classId = folder.scope === 'class' ? (folder.classId ?? null) : null
    } else {
      classId = null
    }
  }

  const pick = <T,>(next: T | null | undefined, prev: T | undefined): T | undefined => {
    if (next === null) return undefined
    if (next !== undefined) return next
    return prev
  }

  const updated: DialogDoc = {
    userId: existing.userId,
    title: data.title ?? existing.title,
    sourceLanguage: data.sourceLanguage ?? existing.sourceLanguage,
    targetLanguage: data.targetLanguage ?? existing.targetLanguage,
    length: existing.length,
    sections: sanitizeSections(data.sections ?? existing.sections),
    folderId,
    classId,
    shareToken: existing.shareToken ?? null,
    creationMode: data.creationMode !== undefined ? data.creationMode : existing.creationMode,
    creationPrompt:
      data.creationPrompt !== undefined ? data.creationPrompt : existing.creationPrompt,
    creationChat: data.creationChat !== undefined ? data.creationChat : existing.creationChat,
    imageDirection:
      data.imageDirection !== undefined ? data.imageDirection : existing.imageDirection,
    filmPrompt: data.filmPrompt !== undefined ? data.filmPrompt : existing.filmPrompt,
    filmPlan: pick(data.filmPlan, existing.filmPlan ?? undefined),
    soundDirection:
      data.soundDirection !== undefined ? data.soundDirection : existing.soundDirection,
    speechDirection:
      data.speechDirection !== undefined ? data.speechDirection : existing.speechDirection,
    filmStoryboard: pick(data.filmStoryboard, existing.filmStoryboard ?? undefined),
    referenceImageUrl: pick(data.referenceImageUrl, existing.referenceImageUrl),
    referenceImagePrompt: pick(data.referenceImagePrompt, existing.referenceImagePrompt),
    speakerProfiles:
      data.speakerProfiles !== undefined ? data.speakerProfiles : existing.speakerProfiles,
    characterBible:
      data.characterBible !== undefined ? data.characterBible : existing.characterBible,
    speakerVoices:
      data.speakerVoices !== undefined ? data.speakerVoices : existing.speakerVoices,
    visualScript: pick(data.visualScript, existing.visualScript),
    visualBrief: pick(data.visualBrief, existing.visualBrief ?? undefined),
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  }

  // Vollständiges set ohne undefined-Felder → gelöschte Keys verschwinden wirklich
  await adminDb().collection('dialogs').doc(id).set(stripUndefined(updated))
  return docToDialog(id, updated)
}

export async function deleteDialog(
  id: string,
  userId: string,
  profile?: UserProfile | null,
): Promise<boolean> {
  const existing = await getDialog(id, userId, profile)
  if (!existing) return false

  const isOwner = existing.userId === userId
  let isClassTeacher = profile?.role === 'master'
  if (!isOwner && existing.classId) {
    const classroom = await getClass(existing.classId)
    isClassTeacher = isClassTeacher || (!!classroom && classroom.teacherId === userId)
  }
  if (!isOwner && !isClassTeacher) return false

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
  profile?: UserProfile | null,
): Promise<Dialog | null> {
  const existing = await getDialog(id, userId, profile)
  if (!existing) return null
  // Klasseninhalte: kein Link-Teilen (nur persönliche Bibliothek → Öffentlichkeit).
  if (existing.classId) return null

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

/** Alle Dialoge eines persönlichen Ordners öffentlich freigeben oder Freigabe beenden. */
export async function setFolderSharing(
  folderId: string,
  userId: string,
  enabled: boolean,
): Promise<{ updated: number; dialogs: Dialog[] } | null> {
  const folder = await getFolder(folderId)
  if (!folder || folder.userId !== userId || folder.scope === 'class') {
    return null
  }

  const snap = await adminDb()
    .collection('dialogs')
    .where('userId', '==', userId)
    .where('folderId', '==', folderId)
    .get()

  const now = new Date().toISOString()
  const dialogs: Dialog[] = []
  const batch = adminDb().batch()
  let ops = 0

  for (const doc of snap.docs) {
    const data = doc.data() as DialogDoc
    if (data.classId) continue
    const shareToken = enabled
      ? data.shareToken && String(data.shareToken).length > 0
        ? String(data.shareToken)
        : randomUUID()
      : null
    batch.update(doc.ref, { shareToken, updatedAt: now })
    ops++
    dialogs.push(
      docToDialog(doc.id, {
        ...data,
        shareToken,
        updatedAt: now,
      }),
    )
  }

  if (ops > 0) await batch.commit()
  return { updated: ops, dialogs }
}

export async function cloneDialog(
  source: Dialog,
  userId: string,
  folderId?: string | null,
): Promise<Dialog> {
  let classId: string | null = null
  if (folderId) {
    const folder = await getFolder(folderId)
    if (folder?.scope === 'class') classId = folder.classId ?? null
  }

  const now = new Date().toISOString()
  const doc: DialogDoc = {
    userId,
    title: `${source.title} (geteilt)`,
    sourceLanguage: source.sourceLanguage,
    targetLanguage: source.targetLanguage,
    length: source.length,
    sections: sanitizeSections(JSON.parse(JSON.stringify(source.sections)) as DialogSection[]),
    folderId: folderId ?? null,
    classId,
    creationMode: source.creationMode,
    creationPrompt: source.creationPrompt,
    // Kein creationChat — private Prompt-Historie bleibt beim Original.
    imageDirection: source.imageDirection,
    filmPrompt: source.filmPrompt,
    filmPlan: source.filmPlan
      ? JSON.parse(JSON.stringify(source.filmPlan))
      : undefined,
    soundDirection: source.soundDirection,
    speechDirection: source.speechDirection,
    filmStoryboard: source.filmStoryboard
      ? JSON.parse(JSON.stringify(source.filmStoryboard))
      : undefined,
    referenceImageUrl: source.referenceImageUrl,
    referenceImagePrompt: source.referenceImagePrompt,
    speakerProfiles: source.speakerProfiles
      ? JSON.parse(JSON.stringify(source.speakerProfiles))
      : undefined,
    characterBible: source.characterBible
      ? JSON.parse(JSON.stringify(source.characterBible))
      : undefined,
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
