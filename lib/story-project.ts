import { randomUUID } from 'crypto'
import { adminDb } from './firebase-admin.js'
import { createFolder, deleteFolder, getFolder, updateFolder } from './folders.js'
import {
  createDialog,
  deleteDialog,
  getDialog,
  updateDialog,
  type UserProfile,
} from './firestore.js'
import { placeholderDraftSection, resolvedFilmTitle } from '../shared/film-draft.js'
import { isStoryFolder, storyProjectName } from '../shared/story-project.js'
import type { Dialog, DialogFolder } from '../shared/types.js'

function newId(): string {
  return randomUUID()
}

async function listDialogsInFolder(folderId: string) {
  const snap = await adminDb().collection('dialogs').where('folderId', '==', folderId).get()
  return snap.docs
}

export async function syncStoryFolderName(
  folderId: string | null | undefined,
  title: string,
): Promise<void> {
  if (!folderId) return
  const folder = await getFolder(folderId)
  if (!isStoryFolder(folder)) return
  const name = storyProjectName(title)
  if (folder.name === name) return
  await updateFolder(folder.id, { name })
}

export async function createStoryProject(
  userId: string,
  input: {
    title: string
    filmPrompt: string
    targetLanguage: string
    parentId?: string | null
  },
): Promise<{ folder: DialogFolder; dialog: Dialog }> {
  const title = resolvedFilmTitle(input.title, input.filmPrompt)
  const parentId = input.parentId ?? null
  const parent = parentId ? await getFolder(parentId) : null
  const folder =
    parent && isStoryFolder(parent)
      ? parent
      : await createFolder(userId, storyProjectName(title), parentId, { kind: 'story' })

  const prompt = input.filmPrompt
  const dialog = await createDialog(userId, {
    title,
    sourceLanguage: 'de',
    targetLanguage: input.targetLanguage,
    length: 'long',
    sections: [placeholderDraftSection(newId(), newId())],
    folderId: folder.id,
    creationMode: 'topic',
    creationPrompt: prompt.trim() || undefined,
    filmPrompt: prompt,
  })
  return { folder, dialog }
}

export async function wrapDialogAsStory(
  userId: string,
  dialogId: string,
  profile?: UserProfile | null,
): Promise<{ folder: DialogFolder; dialog: Dialog }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog) throw new Error('Dialog nicht gefunden.')

  if (dialog.folderId) {
    const current = await getFolder(dialog.folderId)
    if (isStoryFolder(current)) return { folder: current, dialog }
  }

  const parentId = dialog.folderId ?? null
  const folder = await createFolder(dialog.userId, storyProjectName(dialog.title), parentId, {
    kind: 'story',
  })
  const updated = await updateDialog(dialogId, userId, { folderId: folder.id }, profile)
  if (!updated) throw new Error('Konnte die Geschichte nicht in den Ordner legen.')
  return { folder, dialog: updated }
}

export async function deleteEmptyStoryFolder(folderId: string | null | undefined): Promise<void> {
  if (!folderId) return
  const folder = await getFolder(folderId)
  if (!isStoryFolder(folder)) return
  const remaining = await listDialogsInFolder(folderId)
  if (remaining.length > 0) return
  await deleteFolder(folderId)
}

export async function deleteStoryProject(
  userId: string,
  folderId: string,
  profile?: UserProfile | null,
): Promise<boolean> {
  const folder = await getFolder(folderId)
  if (!folder) return false
  if (!isStoryFolder(folder)) {
    throw new Error('Das ist kein Geschichten-Ordner.')
  }
  const docs = await listDialogsInFolder(folderId)
  for (const doc of docs) {
    await deleteDialog(doc.id, userId, profile)
  }
  return deleteFolder(folderId)
}
