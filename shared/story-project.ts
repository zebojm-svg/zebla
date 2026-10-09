import { EMPTY_FILM_TITLE } from './film-draft.js'
import type { DialogFolder, FolderKind, StoryMeta } from './types.js'

export const STORY_FOLDER_KIND: FolderKind = 'story'

export function isStoryFolder(
  folder: Pick<DialogFolder, 'kind'> | null | undefined,
): boolean {
  return folder?.kind === STORY_FOLDER_KIND
}

export function storyProjectName(title: string | undefined | null): string {
  const trimmed = title?.trim() ?? ''
  if (!trimmed || trimmed === EMPTY_FILM_TITLE) return 'Neue Geschichte'
  return trimmed.slice(0, 80)
}

export function normalizeStoryMeta(meta: StoryMeta | null | undefined): StoryMeta {
  return {
    castNote: meta?.castNote?.trim() ?? '',
    roomsNote: meta?.roomsNote?.trim() ?? '',
    voicesNote: meta?.voicesNote?.trim() ?? '',
    lookNote: meta?.lookNote?.trim() ?? '',
  }
}

export function storyMetaFromNotes(input: {
  castNote?: string
  roomsNote?: string
  voicesNote?: string
  lookNote?: string
}): StoryMeta {
  return normalizeStoryMeta(input)
}

export const LIBRARY_SHELVES = [
  {
    id: 'character',
    title: 'Figuren',
    hint: 'Gesichter und Posen — für alle Geschichten',
  },
  {
    id: 'environment',
    title: 'Räume',
    hint: 'Orte und Hintergründe',
  },
  {
    id: 'prop',
    title: 'Möbel',
    hint: 'Stühle, Tische, Deko',
  },
  {
    id: 'sketch',
    title: 'Skizzen',
    hint: 'Günstige Board-Skizzen',
  },
] as const

export type LibraryShelfId = (typeof LIBRARY_SHELVES)[number]['id']

export function isLibraryShelf(value: string | null | undefined): value is LibraryShelfId {
  return LIBRARY_SHELVES.some((shelf) => shelf.id === value)
}
