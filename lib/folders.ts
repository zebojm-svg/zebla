import { adminDb } from './firebase-admin.js'
import type { DialogFolder } from '../shared/types.js'

interface FolderDoc {
  userId: string
  name: string
  parentId: string | null
  scope?: 'personal' | 'class'
  classId?: string | null
  createdAt: string
  updatedAt: string
}

function docToFolder(id: string, data: FolderDoc): DialogFolder {
  return {
    id,
    userId: data.userId,
    name: data.name,
    parentId: data.parentId ?? null,
    scope: data.scope === 'class' ? 'class' : 'personal',
    classId: data.classId ?? null,
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

export async function listFoldersForClassIds(classIds: string[]): Promise<DialogFolder[]> {
  if (!classIds.length) return []
  const folders: DialogFolder[] = []
  for (const classId of [...new Set(classIds)]) {
    const snap = await adminDb()
      .collection('folders')
      .where('classId', '==', classId)
      .get()
    for (const doc of snap.docs) {
      folders.push(docToFolder(doc.id, doc.data() as FolderDoc))
    }
  }
  return folders.sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

export async function getFolder(id: string): Promise<DialogFolder | null> {
  const snap = await adminDb().collection('folders').doc(id).get()
  if (!snap.exists) return null
  return docToFolder(snap.id, snap.data() as FolderDoc)
}

/** @deprecated prefer getFolder + access checks */
export async function getFolderForUser(
  id: string,
  userId: string,
): Promise<DialogFolder | null> {
  const folder = await getFolder(id)
  if (!folder) return null
  if (folder.scope === 'personal' && folder.userId !== userId) return null
  return folder
}

export async function createFolder(
  userId: string,
  name: string,
  parentId?: string | null,
  options?: { scope?: 'personal' | 'class'; classId?: string | null },
): Promise<DialogFolder> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Ordnername fehlt.')

  let scope: 'personal' | 'class' = options?.scope ?? 'personal'
  let classId: string | null = options?.classId ?? null

  if (parentId) {
    const parent = await getFolder(parentId)
    if (!parent) throw new Error('Übergeordneter Ordner nicht gefunden.')
    if (parent.scope === 'class') {
      scope = 'class'
      classId = parent.classId ?? null
      // Persönliche Unterordner unter Klassenordnern gibt es nicht
    } else if (parent.userId !== userId) {
      throw new Error('Übergeordneter Ordner nicht gefunden.')
    }
  }

  const now = new Date().toISOString()
  const doc: FolderDoc = {
    userId,
    name: trimmed,
    parentId: parentId ?? null,
    scope,
    classId,
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
  data: Partial<{ name: string; parentId: string | null }>,
): Promise<DialogFolder | null> {
  const existing = await getFolder(id)
  if (!existing) return null

  const classFolders =
    existing.scope === 'class' && existing.classId
      ? await listFoldersForClassIds([existing.classId])
      : await listFolders(existing.userId)

  let parentId = existing.parentId
  if (data.parentId !== undefined) {
    parentId = data.parentId
    if (parentId === id) throw new Error('Ordner kann nicht in sich selbst verschoben werden.')
    if (parentId && isDescendantFolder(parentId, id, classFolders)) {
      throw new Error('Ordner kann nicht in einen Unterordner verschoben werden.')
    }
    if (parentId) {
      const parent = await getFolder(parentId)
      if (!parent) throw new Error('Zielordner nicht gefunden.')
      if (existing.scope === 'class') {
        if (parent.scope !== 'class' || parent.classId !== existing.classId) {
          throw new Error('Klassenordner bleiben in derselben Klasse.')
        }
      } else if (parent.userId !== existing.userId || parent.scope === 'class') {
        throw new Error('Zielordner nicht gefunden.')
      }
    } else if (existing.scope === 'class') {
      throw new Error('Klassen-Stammordner können nicht ins Hauptverzeichnis.')
    }
  }

  const updated: FolderDoc = {
    userId: existing.userId,
    name: data.name?.trim() || existing.name,
    parentId,
    scope: existing.scope,
    classId: existing.classId ?? null,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  }
  await adminDb().collection('folders').doc(id).set(updated)
  return docToFolder(id, updated)
}

export async function deleteFolder(id: string): Promise<boolean> {
  const folder = await getFolder(id)
  if (!folder) return false
  if (folder.scope === 'class' && folder.parentId === null) {
    throw new Error('Klassen-Stammordner können nicht gelöscht werden.')
  }

  const related =
    folder.scope === 'class' && folder.classId
      ? await listFoldersForClassIds([folder.classId])
      : await listFolders(folder.userId)

  const batch = adminDb().batch()
  const now = new Date().toISOString()

  for (const child of related) {
    if (child.parentId === id) {
      batch.update(adminDb().collection('folders').doc(child.id), {
        parentId: folder.parentId ?? null,
        updatedAt: now,
      })
    }
  }

  let dialogsSnap
  if (folder.scope === 'class' && folder.classId) {
    dialogsSnap = await adminDb()
      .collection('dialogs')
      .where('classId', '==', folder.classId)
      .where('folderId', '==', id)
      .get()
  } else {
    dialogsSnap = await adminDb()
      .collection('dialogs')
      .where('userId', '==', folder.userId)
      .where('folderId', '==', id)
      .get()
  }
  for (const doc of dialogsSnap.docs) {
    batch.update(doc.ref, { folderId: folder.parentId ?? null, updatedAt: now })
  }

  batch.delete(adminDb().collection('folders').doc(id))
  await batch.commit()
  return true
}
