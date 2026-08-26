import type { DialogSection, FilmDraftMode } from './types.js'

export const EMPTY_FILM_TITLE = 'Ohne Titel'

export const FILM_DRAFT_MODES: Array<{ id: FilmDraftMode; label: string; hint: string }> = [
  {
    id: 'embellish',
    label: 'Dialoge ausschmücken',
    hint: 'Die KI macht aus Stichworten einen längeren Film-Dialog — so lang wie die Geschichte braucht.',
  },
  {
    id: 'ask',
    label: 'Zuerst Rückfragen',
    hint: 'Die KI fragt nach, bevor sie Dialog und Storyboard plant.',
  },
  {
    id: 'lucky',
    label: 'Auf gut Glück',
    hint: 'Kein Nachfragen. Sie nimmt den Text und legt los.',
  },
]

export function resolvedFilmTitle(title: string, prompt: string): string {
  const typed = title.trim()
  if (typed) return typed
  const first = prompt
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  if (first) return first.slice(0, 80)
  return EMPTY_FILM_TITLE
}

export function displayFilmTitle(title: string | undefined | null): string {
  const t = title?.trim()
  return t ? t : EMPTY_FILM_TITLE
}

export function isPlaceholderDraftSection(section: DialogSection | undefined): boolean {
  return section?.title === 'Entwurf'
}

export function placeholderDraftSection(id: string, lineId: string): DialogSection {
  return {
    id,
    title: 'Entwurf',
    lines: [
      {
        id: lineId,
        speaker: '—',
        text: 'Noch kein Dialog — dein Text ist gespeichert.',
      },
    ],
  }
}
