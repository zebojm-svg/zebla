import { api } from '../api/client'
import { resolvedFilmTitle } from '../../shared/film-draft'
import type { Dialog, StoryMeta } from '../types'

export async function createFilmDraft(input: {
  title: string
  filmPrompt: string
  targetLanguage: string
  folderId?: string | null
}): Promise<Dialog> {
  const title = resolvedFilmTitle(input.title, input.filmPrompt)
  const { dialog } = await api.storyProjects.create({
    title,
    filmPrompt: input.filmPrompt,
    targetLanguage: input.targetLanguage,
    parentId: input.folderId ?? null,
  })
  return dialog
}

export async function patchFilmDraft(
  id: string,
  input: {
    title: string
    filmPrompt: string
    targetLanguage?: string
    storyMeta?: StoryMeta | null
  },
): Promise<Dialog> {
  const { dialog } = await api.dialogs.update(id, {
    title: resolvedFilmTitle(input.title, input.filmPrompt),
    filmPrompt: input.filmPrompt,
    ...(input.targetLanguage ? { targetLanguage: input.targetLanguage } : {}),
    ...(input.storyMeta !== undefined ? { storyMeta: input.storyMeta } : {}),
  })
  return dialog
}
