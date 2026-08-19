import { randomUUID } from 'crypto'
import { adminDb } from './firebase-admin.js'

export type StoryAssetType = 'character' | 'environment' | 'scene'

export interface StoryLibraryDoc {
  userId: string
  type: StoryAssetType
  name: string
  description?: string
  imageUrl: string
  tags: string[]
  styleId?: string
  legPoseId?: string
  headAngleId?: string
  createdAt: string
}

export interface StoryLibraryAsset extends StoryLibraryDoc {
  id: string
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))]
}

export async function listStoryAssets(
  userId: string,
  opts?: { type?: StoryAssetType; tag?: string },
): Promise<StoryLibraryAsset[]> {
  const snap = await adminDb()
    .collection('storyAssets')
    .where('userId', '==', userId)
    .limit(200)
    .get()

  let items = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as StoryLibraryAsset)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  if (opts?.type) {
    items = items.filter((item) => item.type === opts.type)
  }
  if (opts?.tag) {
    const needle = opts.tag.trim().toLowerCase()
    items = items.filter((item) =>
      item.tags.some((tag) => tag.includes(needle) || needle.includes(tag)),
    )
  }

  return items
}

export async function saveStoryAsset(
  userId: string,
  input: {
    type: StoryAssetType
    name: string
    description?: string
    imageUrl: string
    tags: string[]
    styleId?: string
    legPoseId?: string
    headAngleId?: string
  },
): Promise<StoryLibraryAsset> {
  const id = randomUUID()
  const doc: StoryLibraryDoc = {
    userId,
    type: input.type,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    imageUrl: input.imageUrl,
    tags: normalizeTags(input.tags),
    styleId: input.styleId,
    legPoseId: input.legPoseId,
    headAngleId: input.headAngleId,
    createdAt: new Date().toISOString(),
  }
  await adminDb().collection('storyAssets').doc(id).set(doc)
  return { id, ...doc }
}

export async function deleteStoryAsset(userId: string, id: string): Promise<boolean> {
  const ref = adminDb().collection('storyAssets').doc(id)
  const snap = await ref.get()
  if (!snap.exists) return false
  const data = snap.data() as StoryLibraryDoc
  if (data.userId !== userId) return false
  await ref.delete()
  return true
}
