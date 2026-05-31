import { adminDb } from './firebase-admin.js'
import type { DialogFolder } from '../shared/types.js'

interface FolderDoc {
  userId: string
  name: string
  parentId: string | null
  createdAt: string
  updatedAt: string
}

function docToFolder(id: string, data: FolderDoc): DialogFolder {
  return {
    id,
    userId: data.userId,
    name: data.name,
    parentId: data.parentId ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

export async function listFolders(userId: string): Promise<DialogFolder[]> {
  const snap = await adminDb()
    .collection('folders')
    .where('userId', '==', userId)
    .get()
  return snap.docs
    .map((doc) => docToFolder(doc.id, doc.data() as FolderDoc))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

export async function getFolder(
  id: string,
  userId: string,
): Promise<DialogFolder | null> {
  const snap = await adminDb().collection('folders').doc(id).get()
  if (!snap.exists) return null
  const data = snap.data() as FolderDoc
  if (data.userId !== userId) return null
  return docToFolder(snap.id, data)
}

export async function createFolder(
  userId: string,
  name: string,
  parentId?: string | null,
): Promise<DialogFolder> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Ordnername fehlt.')

  if (parentId) {
    const parent = await getFolder(parentId, userId)
    if (!parent) throw new Error('Übergeordneter Ordner nicht gefunden.')
  }

  const now = new Date().toISOString()
  const doc: FolderDoc = {
    userId,
    name: trimmed,
    parentId: parentId ?? null,
    createdAt: now,
    updatedAt: now,
  }
  const ref = await adminDb().collection('folders').add(doc)
  return docToFolder(ref.id, doc)
}

function isDescendantFolder(
  folderId: string,
  potentialAncestorId: string,
  folders: DialogFolder[],
): boolean {
  const byId = new Map(folders.map((f) => [f.id, f]))
  let cur: string | null = folderId
  while (cur) {
    if (cur === potentialAncestorId) return true
    cur = byId.get(cur)?.parentId ?? null
  }
  return false
}

export async function updateFolder(
  id: string,
  userId: string,
  data: Partial<{ name: string; parentId: string | null }>,
): Promise<DialogFolder | null> {
  const existing = await getFolder(id, userId)
  if (!existing) return null

  const allFolders = await listFolders(userId)
  let parentId = existing.parentId
  if (data.parentId !== undefined) {
    parentId = data.parentId
    if (parentId === id) throw new Error('Ordner kann nicht in sich selbst verschoben werden.')
    if (parentId && isDescendantFolder(parentId, id, allFolders)) {
      throw new Error('Ordner kann nicht in einen Unterordner verschoben werden.')
    }
    if (parentId) {
      const parent = await getFolder(parentId, userId)
      if (!parent) throw new Error('Zielordner nicht gefunden.')
    }
  }

  const updated: FolderDoc = {
    userId,
    name: data.name?.trim() || existing.name,
    parentId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  }
  await adminDb().collection('folders').doc(id).set(updated)
  return docToFolder(id, updated)
}

export async function deleteFolder(id: string, userId: string): Promise<boolean> {
  const folder = await getFolder(id, userId)
  if (!folder) return false

  const allFolders = await listFolders(userId)
  const batch = adminDb().batch()
  const now = new Date().toISOString()

  for (const child of allFolders) {
    if (child.parentId === id) {
      batch.update(adminDb().collection('folders').doc(child.id), {
        parentId: folder.parentId ?? null,
        updatedAt: now,
      })
    }
  }

  const dialogsSnap = await adminDb()
    .collection('dialogs')
    .where('userId', '==', userId)
    .where('folderId', '==', id)
    .get()
  for (const doc of dialogsSnap.docs) {
    batch.update(doc.ref, { folderId: folder.parentId ?? null, updatedAt: now })
  }

  batch.delete(adminDb().collection('folders').doc(id))
  await batch.commit()
  return true
}
