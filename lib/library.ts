import {
  listDialogs,
  listDialogsForClassIds,
  getUserProfile,
  type UserProfile,
} from './firestore.js'
import { listFolders, listFoldersForClassIds } from './folders.js'
import { listClassesForTeacher, listClassesByIds } from './classes.js'
import type { ClassRoom, Dialog, DialogFolder } from '../shared/types.js'
import { remainingQuota } from './usage.js'

function mergeById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of items) map.set(item.id, item)
  return [...map.values()]
}

export async function loadLibraryForUser(profile: UserProfile): Promise<{
  folders: DialogFolder[]
  dialogs: Dialog[]
  classes: ClassRoom[]
}> {
  const personalFolders = await listFolders(profile.id)
  const personalDialogs = await listDialogs(profile.id)

  let classIds = [...profile.classIds]
  let classes: ClassRoom[] = []

  if (profile.role === 'teacher' || profile.role === 'master') {
    const taught = await listClassesForTeacher(profile.id)
    classes = taught
    classIds = [...new Set([...classIds, ...taught.map((c) => c.id)])]
  } else if (classIds.length) {
    classes = await listClassesByIds(classIds)
  }

  const classFolders = await listFoldersForClassIds(classIds)
  const classDialogs = await listDialogsForClassIds(classIds)

  return {
    folders: mergeById([...personalFolders, ...classFolders]),
    dialogs: mergeById([...personalDialogs, ...classDialogs]),
    classes,
  }
}

export async function enrichClientUser(profile: UserProfile) {
  const { profileToClientUser } = await import('./firestore.js')
  const quota = await remainingQuota(profile)
  return { ...profileToClientUser(profile), quota }
}

export async function getProfileOrThrow(uid: string): Promise<UserProfile> {
  const profile = await getUserProfile(uid)
  if (!profile) throw new Error('Profil nicht gefunden.')
  return profile
}
