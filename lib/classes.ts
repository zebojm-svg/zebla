import { randomBytes } from 'crypto'
import { adminDb } from './firebase-admin.js'
import { createFolder, getFolder } from './folders.js'
import type { ClassRoom, StudentCodeInfo } from '../shared/types.js'
import { HttpError } from './api-utils.js'

interface ClassDoc {
  name: string
  teacherId: string
  classCode: string
  rootFolderId: string
  createdAt: string
  updatedAt: string
}

function randomCode(length = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length]
  }
  return out
}

function docToClass(id: string, data: ClassDoc): ClassRoom {
  return {
    id,
    name: data.name,
    teacherId: data.teacherId,
    classCode: data.classCode,
    rootFolderId: data.rootFolderId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

async function uniqueClassCode(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = randomCode(6)
    const snap = await adminDb()
      .collection('classes')
      .where('classCode', '==', code)
      .limit(1)
      .get()
    if (snap.empty) return code
  }
  throw new Error('Klassencode konnte nicht erzeugt werden.')
}

async function uniqueStudentCode(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = randomCode(8)
    const snap = await adminDb().collection('studentCodes').doc(code).get()
    if (!snap.exists) return code
  }
  throw new Error('Schülercode konnte nicht erzeugt werden.')
}

export async function getClass(classId: string): Promise<ClassRoom | null> {
  const snap = await adminDb().collection('classes').doc(classId).get()
  if (!snap.exists) return null
  return docToClass(snap.id, snap.data() as ClassDoc)
}

export async function getClassByCode(classCode: string): Promise<ClassRoom | null> {
  const normalized = classCode.toUpperCase().trim()
  const snap = await adminDb()
    .collection('classes')
    .where('classCode', '==', normalized)
    .limit(1)
    .get()
  if (snap.empty) return null
  const doc = snap.docs[0]!
  return docToClass(doc.id, doc.data() as ClassDoc)
}

export async function listClassesForTeacher(teacherId: string): Promise<ClassRoom[]> {
  const snap = await adminDb()
    .collection('classes')
    .where('teacherId', '==', teacherId)
    .get()
  return snap.docs
    .map((doc) => docToClass(doc.id, doc.data() as ClassDoc))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

export async function listClassesByIds(ids: string[]): Promise<ClassRoom[]> {
  if (!ids.length) return []
  const unique = [...new Set(ids)]
  const classes: ClassRoom[] = []
  // Firestore getAll in chunks of 10
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10)
    const refs = chunk.map((id) => adminDb().collection('classes').doc(id))
    const snaps = await adminDb().getAll(...refs)
    for (const snap of snaps) {
      if (snap.exists) classes.push(docToClass(snap.id, snap.data() as ClassDoc))
    }
  }
  return classes.sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

export async function createClass(
  teacherId: string,
  name: string,
): Promise<ClassRoom> {
  const trimmed = name.trim()
  if (!trimmed) throw new HttpError('Klassenname fehlt.', 400)

  const classCode = await uniqueClassCode()
  const now = new Date().toISOString()
  const classRef = adminDb().collection('classes').doc()

  const rootFolder = await createFolder(teacherId, trimmed, null, {
    scope: 'class',
    classId: classRef.id,
  })

  const doc: ClassDoc = {
    name: trimmed,
    teacherId,
    classCode,
    rootFolderId: rootFolder.id,
    createdAt: now,
    updatedAt: now,
  }
  await classRef.set(doc)
  return docToClass(classRef.id, doc)
}

export async function deleteClass(
  classId: string,
  teacherId: string,
  isMaster: boolean,
): Promise<boolean> {
  const classroom = await getClass(classId)
  if (!classroom) return false
  if (!isMaster && classroom.teacherId !== teacherId) {
    throw new HttpError('Keine Berechtigung.', 403)
  }

  const codes = await adminDb()
    .collection('studentCodes')
    .where('classId', '==', classId)
    .get()
  const batch = adminDb().batch()
  for (const doc of codes.docs) batch.delete(doc.ref)
  batch.delete(adminDb().collection('classes').doc(classId))
  await batch.commit()
  return true
}

export async function createStudentCode(
  classId: string,
  teacherId: string,
  label?: string,
  isMaster = false,
): Promise<StudentCodeInfo> {
  const classroom = await getClass(classId)
  if (!classroom) throw new HttpError('Klasse nicht gefunden.', 404)
  if (!isMaster && classroom.teacherId !== teacherId) {
    throw new HttpError('Keine Berechtigung.', 403)
  }

  const code = await uniqueStudentCode()
  const now = new Date().toISOString()
  const data = {
    classId,
    label: label?.trim() || null,
    userId: null,
    createdAt: now,
  }
  await adminDb().collection('studentCodes').doc(code).set(data)
  return {
    code,
    classId,
    label: label?.trim(),
    userId: null,
    createdAt: now,
  }
}

export async function listStudentCodes(
  classId: string,
  teacherId: string,
  isMaster = false,
): Promise<StudentCodeInfo[]> {
  const classroom = await getClass(classId)
  if (!classroom) throw new HttpError('Klasse nicht gefunden.', 404)
  if (!isMaster && classroom.teacherId !== teacherId) {
    throw new HttpError('Keine Berechtigung.', 403)
  }

  const snap = await adminDb()
    .collection('studentCodes')
    .where('classId', '==', classId)
    .get()
  return snap.docs
    .map((doc) => {
      const d = doc.data()
      return {
        code: doc.id,
        classId: d.classId as string,
        label: (d.label as string | null) ?? undefined,
        userId: (d.userId as string | null) ?? null,
        createdAt: d.createdAt as string,
      }
    })
    .sort((a, b) => a.code.localeCompare(b.code))
}

export async function deleteStudentCode(
  code: string,
  teacherId: string,
  isMaster = false,
): Promise<boolean> {
  const normalized = code.toUpperCase().trim()
  const ref = adminDb().collection('studentCodes').doc(normalized)
  const snap = await ref.get()
  if (!snap.exists) return false
  const data = snap.data()!
  const classroom = await getClass(data.classId as string)
  if (!classroom) return false
  if (!isMaster && classroom.teacherId !== teacherId) {
    throw new HttpError('Keine Berechtigung.', 403)
  }
  await ref.delete()
  return true
}

export async function userCanAccessClass(
  userId: string,
  classId: string,
  role: string,
  classIds: string[],
): Promise<boolean> {
  if (role === 'master') return true
  if (classIds.includes(classId)) return true
  const classroom = await getClass(classId)
  if (!classroom) return false
  return classroom.teacherId === userId
}

export async function assertClassFolderAccess(
  folderId: string,
  userId: string,
  role: string,
  classIds: string[],
  mode: 'read' | 'manage',
): Promise<{ classId: string; isTeacher: boolean }> {
  const folder = await getFolder(folderId)
  if (!folder || folder.scope !== 'class' || !folder.classId) {
    throw new HttpError('Klassenordner nicht gefunden.', 404)
  }
  const ok = await userCanAccessClass(userId, folder.classId, role, classIds)
  if (!ok) throw new HttpError('Keine Berechtigung.', 403)

  const classroom = await getClass(folder.classId)
  const isTeacher =
    role === 'master' || (!!classroom && classroom.teacherId === userId)

  if (mode === 'manage' && !isTeacher) {
    throw new HttpError('Nur Lehrkräfte dürfen Klassenordner verwalten.', 403)
  }

  return { classId: folder.classId, isTeacher }
}
