import { randomUUID } from 'crypto'
import { adminDb } from './firebase-admin.js'
import type { PublicCatalogFolder, PublicCatalogItem } from '../shared/public-catalog.js'

const FOLDERS = 'publicCatalogFolders'
const ITEMS = 'publicCatalogItems'

function folderFromDoc(id: string, data: FirebaseFirestore.DocumentData): PublicCatalogFolder {
  return {
    id,
    name: String(data.name ?? ''),
    parentId: (data.parentId as string | null | undefined) ?? null,
    sourceLanguage: data.sourceLanguage as string | undefined,
    targetLanguage: data.targetLanguage as string | undefined,
    sortOrder: Number(data.sortOrder ?? 0),
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  }
}

function itemFromDoc(id: string, data: FirebaseFirestore.DocumentData): PublicCatalogItem {
  return {
    id,
    folderId: String(data.folderId ?? ''),
    title: String(data.title ?? ''),
    description: data.description as string | undefined,
    thumbnailUrl: data.thumbnailUrl as string | undefined,
    videoUrl: data.videoUrl as string | undefined,
    pdfUrl: data.pdfUrl as string | undefined,
    shareToken: data.shareToken as string | undefined,
    dialogId: data.dialogId as string | undefined,
    sortOrder: Number(data.sortOrder ?? 0),
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  }
}

async function resolveFolderLanguages(
  folderId: string | null,
): Promise<{ sourceLanguage?: string; targetLanguage?: string }> {
  if (!folderId) return {}
  const snap = await adminDb().collection(FOLDERS).doc(folderId).get()
  if (!snap.exists) return {}
  const data = snap.data()!
  if (data.sourceLanguage && data.targetLanguage) {
    return {
      sourceLanguage: data.sourceLanguage as string,
      targetLanguage: data.targetLanguage as string,
    }
  }
  return resolveFolderLanguages((data.parentId as string | null) ?? null)
}

export async function listPublicCatalog(folderId?: string | null): Promise<{
  folders: PublicCatalogFolder[]
  items: PublicCatalogItem[]
}> {
  const parent = folderId ?? null
  const [folderSnap, itemSnap] = await Promise.all([
    adminDb().collection(FOLDERS).limit(200).get(),
    adminDb().collection(ITEMS).limit(300).get(),
  ])

  const allFolders = folderSnap.docs.map((d) => folderFromDoc(d.id, d.data()))
  const folders = allFolders
    .filter((f) => (f.parentId ?? null) === parent)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'de'))

  const items = itemSnap.docs
    .map((d) => itemFromDoc(d.id, d.data()))
    .filter((i) => i.folderId === (parent ?? ''))
    .sort((a, b) => a.sortOrder - b.sortOrder || b.updatedAt.localeCompare(a.updatedAt))

  return { folders, items }
}

export async function getPublicCatalogItem(id: string): Promise<PublicCatalogItem | null> {
  const snap = await adminDb().collection(ITEMS).doc(id).get()
  if (!snap.exists) return null
  return itemFromDoc(snap.id, snap.data()!)
}

export async function createPublicFolder(input: {
  name: string
  parentId?: string | null
  sourceLanguage?: string
  targetLanguage?: string
}): Promise<PublicCatalogFolder> {
  const now = new Date().toISOString()
  const id = randomUUID()
  let sourceLanguage = input.sourceLanguage
  let targetLanguage = input.targetLanguage
  if (input.parentId && (!sourceLanguage || !targetLanguage)) {
    const inherited = await resolveFolderLanguages(input.parentId)
    sourceLanguage = sourceLanguage ?? inherited.sourceLanguage
    targetLanguage = targetLanguage ?? inherited.targetLanguage
  }
  const doc = {
    name: input.name.trim(),
    parentId: input.parentId ?? null,
    sourceLanguage: sourceLanguage ?? null,
    targetLanguage: targetLanguage ?? null,
    sortOrder: Date.now(),
    createdAt: now,
    updatedAt: now,
  }
  await adminDb().collection(FOLDERS).doc(id).set(doc)
  return folderFromDoc(id, doc)
}

export async function updatePublicFolder(
  id: string,
  patch: Partial<Pick<PublicCatalogFolder, 'name' | 'sortOrder'>>,
): Promise<PublicCatalogFolder | null> {
  const ref = adminDb().collection(FOLDERS).doc(id)
  const snap = await ref.get()
  if (!snap.exists) return null
  const updated = {
    ...snap.data(),
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  await ref.set(updated)
  return folderFromDoc(id, updated)
}

export async function deletePublicFolder(id: string): Promise<boolean> {
  const childFolders = await adminDb()
    .collection(FOLDERS)
    .where('parentId', '==', id)
    .limit(1)
    .get()
  if (!childFolders.empty) {
    throw new Error('Ordner enthält Unterordner — zuerst leeren.')
  }
  const items = await adminDb().collection(ITEMS).where('folderId', '==', id).limit(1).get()
  if (!items.empty) {
    throw new Error('Ordner enthält Einträge — zuerst löschen.')
  }
  await adminDb().collection(FOLDERS).doc(id).delete()
  return true
}

export async function createPublicItem(input: {
  folderId: string
  title: string
  description?: string
  shareToken?: string
  dialogId?: string
}): Promise<PublicCatalogItem> {
  const now = new Date().toISOString()
  const id = randomUUID()
  const doc = {
    folderId: input.folderId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    shareToken: input.shareToken?.trim() || null,
    dialogId: input.dialogId?.trim() || null,
    thumbnailUrl: null,
    videoUrl: null,
    pdfUrl: null,
    sortOrder: Date.now(),
    createdAt: now,
    updatedAt: now,
  }
  await adminDb().collection(ITEMS).doc(id).set(doc)
  return itemFromDoc(id, doc)
}

export async function updatePublicItem(
  id: string,
  patch: Partial<
    Pick<
      PublicCatalogItem,
      | 'title'
      | 'description'
      | 'thumbnailUrl'
      | 'videoUrl'
      | 'pdfUrl'
      | 'shareToken'
      | 'dialogId'
      | 'sortOrder'
      | 'folderId'
    >
  >,
): Promise<PublicCatalogItem | null> {
  const ref = adminDb().collection(ITEMS).doc(id)
  const snap = await ref.get()
  if (!snap.exists) return null
  const updated = {
    ...snap.data(),
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  await ref.set(updated)
  return itemFromDoc(id, updated)
}

export async function deletePublicItem(id: string): Promise<boolean> {
  await adminDb().collection(ITEMS).doc(id).delete()
  return true
}

export async function folderBreadcrumbs(folderId: string | null): Promise<PublicCatalogFolder[]> {
  if (!folderId) return []
  const snap = await adminDb().collection(FOLDERS).limit(200).get()
  const byId = new Map(snap.docs.map((d) => [d.id, folderFromDoc(d.id, d.data())]))
  const path: PublicCatalogFolder[] = []
  let cur: string | null = folderId
  while (cur) {
    const folder = byId.get(cur)
    if (!folder) break
    path.unshift(folder)
    cur = folder.parentId
  }
  return path
}
