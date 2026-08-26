import { api } from '../api/client'
import { placeholderDraftSection, resolvedFilmTitle } from '../../shared/film-draft'
import type { Dialog } from '../types'

function newId(): string {
  return crypto.randomUUID()
}

export async function createFilmDraft(input: {
  title: string
  filmPrompt: string
  targetLanguage: string
  folderId?: string | null
}): Promise<Dialog> {
  const title = resolvedFilmTitle(input.title, input.filmPrompt)
  const prompt = input.filmPrompt
  const { dialog } = await api.dialogs.create({
    title,
    sourceLanguage: 'de',
    targetLanguage: input.targetLanguage,
    length: 'long',
    sections: [placeholderDraftSection(newId(), newId())],
    folderId: input.folderId ?? null,
    creationMode: 'topic',
    creationPrompt: prompt.trim() || undefined,
    filmPrompt: prompt,
  })
  return dialog
}

export async function patchFilmDraft(
  id: string,
  input: { title: string; filmPrompt: string; targetLanguage?: string },
): Promise<Dialog> {
  const { dialog } = await api.dialogs.update(id, {
    title: resolvedFilmTitle(input.title, input.filmPrompt),
    filmPrompt: input.filmPrompt,
    ...(input.targetLanguage ? { targetLanguage: input.targetLanguage } : {}),
  })
  return dialog
}
