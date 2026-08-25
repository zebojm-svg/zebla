import { chatJson } from './ai.js'
import { listStoryAssets } from './story-library.js'
import { getDialog, updateDialog, type UserProfile } from './firestore.js'
import type { Dialog } from '../shared/types.js'
import {
  applyDirectorNote,
  buildBoardFromDrafts,
  draftPanelsFromDialog,
  isFilmStoryboard,
  planBoardWithoutAi,
  type FilmDraftPanel,
  type FilmStoryboard,
} from '../shared/film-storyboard.js'

const PLAN_SYSTEM = `Du planst ein billiges Comic-Storyboard. Keine Bilder zeichnen.
Nur JSON. Gruppiere aufeinanderfolgende Zeilen am gleichen Ort in ein Bild.
Schema:
{
  "summaryDe": "ein Satz",
  "panels": [
    {
      "sectionId": "id",
      "lineIds": ["id"],
      "caption": "kurz",
      "imageCue": "was man sieht",
      "soundCue": "Ton oder leer",
      "speechCue": "wie gesprochen oder leer",
      "settingHint": "Ort",
      "characters": [
        { "name": "Julien", "poseHint": "sitting|standing-front|waving|look-left|look-right|walking|standing-three-quarter", "depth": "foreground|mid|background", "x": 40 }
      ]
    }
  ]
}
Regeln:
- Namen der Sprecher unverändert übernehmen.
- poseHint nur aus der Liste.
- x zwischen 15 und 85.
- Weniger Bilder als Zeilen, wenn sie zusammengehören.`

function flattenDialog(dialog: Dialog): string {
  const lines: string[] = [
    `Titel: ${dialog.title}`,
    dialog.imageDirection ? `Bild-Regie: ${dialog.imageDirection}` : '',
    dialog.soundDirection ? `Ton-Regie: ${dialog.soundDirection}` : '',
    dialog.speechDirection ? `Sprach-Regie: ${dialog.speechDirection}` : '',
  ]
  for (const section of dialog.sections) {
    lines.push(`Abschnitt ${section.id} «${section.title}»`)
    for (const line of section.lines) {
      lines.push(
        `- ${line.id} | ${line.speaker}: ${line.text}` +
          (line.cueImage ? ` [Bild: ${line.cueImage}]` : '') +
          (line.cueSound ? ` [Ton: ${line.cueSound}]` : '') +
          (line.cueSpeech ? ` [Sprache: ${line.cueSpeech}]` : ''),
      )
    }
  }
  return lines.filter(Boolean).join('\n')
}

async function draftsFromGemini(dialog: Dialog): Promise<FilmDraftPanel[] | null> {
  try {
    const raw = await chatJson<{ panels?: FilmDraftPanel[]; summaryDe?: string }>(
      PLAN_SYSTEM,
      flattenDialog(dialog),
    )
    const panels = Array.isArray(raw.panels) ? raw.panels : []
    const valid = panels.filter(
      (p) => p.sectionId && Array.isArray(p.lineIds) && p.lineIds.length > 0,
    )
    if (valid.length === 0) return null
    return valid
  } catch {
    return null
  }
}

export async function planFilmStoryboard(
  dialogId: string,
  userId: string,
  profile?: UserProfile | null,
  opts?: { cheapAi?: boolean },
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog) throw new Error('Dialog nicht gefunden.')

  const library = await listStoryAssets(userId)
  const useAi = opts?.cheapAi !== false
  const aiDrafts = useAi ? await draftsFromGemini(dialog) : null
  const drafts = aiDrafts ?? draftPanelsFromDialog(dialog)
  const board = buildBoardFromDrafts(
    dialog,
    drafts,
    library,
    aiDrafts ? 'gemini' : 'rules',
  )

  const updated = await updateDialog(dialogId, userId, { filmStoryboard: board }, profile)
  if (!updated) throw new Error('Storyboard konnte nicht gespeichert werden.')
  return { dialog: updated, board }
}

export async function tweakFilmPanel(
  dialogId: string,
  userId: string,
  panelId: string,
  note: string,
  profile?: UserProfile | null,
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog) throw new Error('Dialog nicht gefunden.')
  if (!isFilmStoryboard(dialog.filmStoryboard)) {
    throw new Error('Noch kein Storyboard. Erst aus dem Dialog erzeugen.')
  }
  const board = applyDirectorNote(dialog.filmStoryboard, panelId, note)
  const updated = await updateDialog(dialogId, userId, { filmStoryboard: board }, profile)
  if (!updated) throw new Error('Änderung konnte nicht gespeichert werden.')
  return { dialog: updated, board }
}
