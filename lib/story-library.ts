import { isCharacterRig, type CharacterRig } from '../shared/character-rig.js'
import { REFERENCE_TAG } from '../shared/reference-catalog.js'
import { randomUUID } from 'crypto'
import { adminDb } from './firebase-admin.js'

export type StoryAssetType = 'character' | 'environment' | 'scene' | 'prop' | 'sound'

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
  armPoseId?: string
  faceExpressionId?: string
  rig?: CharacterRig
  basisId?: string
  prompt?: string
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
    armPoseId?: string
    faceExpressionId?: string
    rig?: CharacterRig
    basisId?: string
    prompt?: string
  },
): Promise<StoryLibraryAsset> {
  const id = randomUUID()
  const rig = isCharacterRig(input.rig) ? input.rig : undefined
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
    armPoseId: input.armPoseId,
    faceExpressionId: input.faceExpressionId,
    rig,
    createdAt: new Date().toISOString(),
  }
  const basisId = input.basisId?.trim()
  if (basisId) doc.basisId = basisId
  const prompt = input.prompt?.trim()
  if (prompt) doc.prompt = prompt.slice(0, 12000)
  await adminDb().collection('storyAssets').doc(id).set(doc)
  return { id, ...doc }
}

export async function updateStoryAssetRig(
  userId: string,
  id: string,
  rig: CharacterRig,
  imageUrl?: string,
): Promise<StoryLibraryAsset | null> {
  if (!isCharacterRig(rig)) return null
  const ref = adminDb().collection('storyAssets').doc(id)
  const snap = await ref.get()
  if (!snap.exists) return null
  const data = snap.data() as StoryLibraryDoc
  if (data.userId !== userId) return null
  const patch: { rig: CharacterRig; imageUrl?: string } = { rig }
  if (imageUrl?.trim()) patch.imageUrl = imageUrl.trim()
  await ref.update(patch)
  return { id, ...data, rig, imageUrl: patch.imageUrl ?? data.imageUrl }
}

export async function markStoryAssetReference(
  userId: string,
  id: string,
): Promise<StoryLibraryAsset | null> {
  const ref = adminDb().collection('storyAssets').doc(id)
  const snap = await ref.get()
  if (!snap.exists) return null
  const data = snap.data() as StoryLibraryDoc
  if (data.userId !== userId) return null
  if (data.type !== 'character' && data.type !== 'environment') return null
  const tags = normalizeTags([...(data.tags ?? []), REFERENCE_TAG])
  await ref.update({ tags })
  return { id, ...data, tags }
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
