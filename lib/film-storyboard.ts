import { chatJson } from './ai.js'
import { listStoryAssets, saveStoryAsset } from './story-library.js'
import { getDialog, updateDialog, type UserProfile } from './firestore.js'
import type { Dialog } from '../shared/types.js'
import {
  applyDirectorNote,
  applyPanelComment,
  applySceneNote,
  buildBoardFromDrafts,
  draftPanelsFromDialog,
  insertPanelAfter,
  insertSceneAfter,
  isFilmStoryboard,
  normalizeFilmStoryboard,
  type FilmDraftPanel,
  type FilmPlan,
  type FilmStoryboard,
} from '../shared/film-storyboard.js'
import { generateCheapStoryboardSketch } from './film-sketch.js'

const PLAN_SYSTEM = `Du planst ein billiges Comic-Storyboard. Keine fertigen Film-Bilder.
Nur JSON. Beliebig viele Figuren. Gruppiere Zeilen am gleichen Ort.
Schema:
{
  "summaryDe": "ein Satz",
  "panels": [
    {
      "sectionId": "id oder scene-1",
      "lineIds": ["id"],
      "caption": "kurz",
      "imageCue": "was man sieht",
      "soundCue": "Ton oder leer",
      "speechCue": "wie gesprochen",
      "settingHint": "Ort",
      "expressionHint": "freut sich|traurig|schreit|überrascht|neutral|leise / flüstert",
      "characters": [
        { "name": "Julien", "poseHint": "sitting|standing-front|waving|look-left|look-right|walking|standing-three-quarter", "depth": "foreground|mid|background", "x": 40 }
      ]
    }
  ]
}
Regeln:
- Namen unverändert.
- poseHint nur aus der Liste.
- x 15–85.
- Mehrere Personen in einem Bild, wenn der Text das sagt.`

function flattenDialog(dialog: Dialog, extra = ''): string {
  const lines: string[] = [
    `Titel: ${dialog.title}`,
    `Zielsprache: ${dialog.targetLanguage}`,
    dialog.filmPrompt ? `Film-Prompt:\n${dialog.filmPrompt}` : '',
    dialog.imageDirection ? `Bild-Regie: ${dialog.imageDirection}` : '',
    dialog.soundDirection ? `Ton-Regie: ${dialog.soundDirection}` : '',
    dialog.speechDirection ? `Sprach-Regie: ${dialog.speechDirection}` : '',
    extra,
  ]
  const board = isFilmStoryboard(dialog.filmStoryboard)
    ? normalizeFilmStoryboard(dialog.filmStoryboard)
    : null
  if (board) {
    for (const scene of board.scenes) {
      lines.push(`Szene ${scene.id} «${scene.title}» Notiz: ${scene.noteDe || '—'}`)
    }
  }
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

async function draftsFromGemini(dialog: Dialog, extra = ''): Promise<FilmDraftPanel[] | null> {
  try {
    const raw = await chatJson<{ panels?: FilmDraftPanel[]; summaryDe?: string }>(
      PLAN_SYSTEM,
      flattenDialog(dialog, extra),
    )
    const panels = Array.isArray(raw.panels) ? raw.panels : []
    const valid = panels.filter((p) => p.caption || (Array.isArray(p.lineIds) && p.lineIds.length > 0))
    if (valid.length === 0) return null
    return valid.map((p) => ({
      ...p,
      sectionId: p.sectionId || dialog.sections[0]?.id || 'scene-1',
      lineIds: p.lineIds?.length ? p.lineIds : [],
    }))
  } catch {
    return null
  }
}

async function saveBoard(
  dialogId: string,
  userId: string,
  board: FilmStoryboard,
  profile?: UserProfile | null,
) {
  const updated = await updateDialog(
    dialogId,
    userId,
    { filmStoryboard: normalizeFilmStoryboard(board) },
    profile,
  )
  if (!updated) throw new Error('Storyboard konnte nicht gespeichert werden.')
  return updated
}

export async function planFilmStoryboard(
  dialogId: string,
  userId: string,
  profile?: UserProfile | null,
  opts?: { cheapAi?: boolean; extra?: string; keepBoard?: boolean },
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog) throw new Error('Dialog nicht gefunden.')

  const library = await listStoryAssets(userId)
  const previous = opts?.keepBoard && isFilmStoryboard(dialog.filmStoryboard)
    ? normalizeFilmStoryboard(dialog.filmStoryboard)
    : undefined
  const useAi = opts?.cheapAi !== false
  const aiDrafts = useAi ? await draftsFromGemini(dialog, opts?.extra ?? '') : null
  const drafts = aiDrafts ?? draftPanelsFromDialog(dialog)
  const board = buildBoardFromDrafts(
    dialog,
    drafts,
    library,
    aiDrafts ? 'gemini' : 'rules',
    previous,
  )

  const updated = await saveBoard(dialogId, userId, board, profile)
  return { dialog: updated, board: updated.filmStoryboard as FilmStoryboard }
}

export async function regenerateFilmScenes(
  dialogId: string,
  userId: string,
  sceneIds: string[],
  profile?: UserProfile | null,
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) {
    throw new Error('Noch kein Storyboard.')
  }
  const current = normalizeFilmStoryboard(dialog.filmStoryboard)
  const wanted = new Set(sceneIds)
  const notes = current.scenes
    .filter((s) => wanted.has(s.id))
    .map((s) => {
      const comments = current.panels
        .filter((p) => p.sceneId === s.id && (p.comment || p.directorNote))
        .map((p) => `- ${p.caption}: ${p.comment || p.directorNote}`)
        .join('\n')
      return `Szene «${s.title}» (${s.id}) anpassen. Szenennotiz: ${s.noteDe || '—'}\n${comments}`
    })
    .join('\n\n')

  const extra =
    `Bitte NUR diese Szenen neu planen, Rest unverändert lassen: ${[...wanted].join(', ')}\n${notes}`
  const library = await listStoryAssets(userId)
  const aiDrafts = await draftsFromGemini(dialog, extra)
  if (!aiDrafts) {
    throw new Error('Die KI hat die Szene nicht neu planen können. Bitte Notiz kürzer fassen.')
  }

  const rebuilt = buildBoardFromDrafts(dialog, aiDrafts, library, 'gemini', current)
  const kept = current.panels.filter((p) => !wanted.has(p.sceneId))
  const fresh = rebuilt.panels.filter((p) => wanted.has(p.sceneId) || wanted.has(p.sectionId))
  const panels = [...kept, ...fresh]
  const scenes = [
    ...current.scenes.filter((s) => !wanted.has(s.id)),
    ...rebuilt.scenes.filter((s) => wanted.has(s.id)),
  ]
  const board: FilmStoryboard = {
    ...current,
    ...rebuilt,
    scenes: scenes.length ? scenes : rebuilt.scenes,
    panels,
    updatedAt: new Date().toISOString(),
  }
  const updated = await saveBoard(dialogId, userId, board, profile)
  return { dialog: updated, board: updated.filmStoryboard as FilmStoryboard }
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
  const board = applyDirectorNote(normalizeFilmStoryboard(dialog.filmStoryboard), panelId, note)
  const updated = await saveBoard(dialogId, userId, board, profile)
  return { dialog: updated, board }
}

export async function commentFilmPanel(
  dialogId: string,
  userId: string,
  panelId: string,
  comment: string,
  profile?: UserProfile | null,
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  const board = applyPanelComment(dialog.filmStoryboard, panelId, comment)
  const updated = await saveBoard(dialogId, userId, board, profile)
  return { dialog: updated, board }
}

export async function noteFilmScene(
  dialogId: string,
  userId: string,
  sceneId: string,
  noteDe: string,
  profile?: UserProfile | null,
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  const board = applySceneNote(dialog.filmStoryboard, sceneId, noteDe)
  const updated = await saveBoard(dialogId, userId, board, profile)
  return { dialog: updated, board }
}

export async function insertFilmPanel(
  dialogId: string,
  userId: string,
  afterPanelId: string,
  text: string,
  profile?: UserProfile | null,
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  const library = await listStoryAssets(userId)
  const board = insertPanelAfter(dialog.filmStoryboard, afterPanelId, text, library)
  const updated = await saveBoard(dialogId, userId, board, profile)
  return { dialog: updated, board }
}

export async function insertFilmScene(
  dialogId: string,
  userId: string,
  afterSceneId: string | null,
  title: string,
  profile?: UserProfile | null,
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  const board = insertSceneAfter(dialog.filmStoryboard, afterSceneId, title)
  const updated = await saveBoard(dialogId, userId, board, profile)
  return { dialog: updated, board }
}

export async function sketchFilmPanel(
  dialogId: string,
  userId: string,
  panelId: string,
  profile?: UserProfile | null,
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  const board = normalizeFilmStoryboard(dialog.filmStoryboard)
  const panel = board.panels.find((p) => p.id === panelId)
  if (!panel) throw new Error('Bild nicht gefunden.')
  const url = await generateCheapStoryboardSketch({
    caption: panel.caption,
    expressionHint: panel.expressionHint,
    settingHint: panel.settingHint,
    names: panel.placements.map((p) => p.name),
  })
  const asset = await saveStoryAsset(userId, {
    type: 'scene',
    name: `Skizze · ${panel.caption.slice(0, 40)}`,
    description: panel.expressionHint,
    imageUrl: url,
    tags: ['sketch', 'storyboard', ...panel.placements.map((p) => p.name.toLowerCase())],
  })
  const next: FilmStoryboard = {
    ...board,
    panels: board.panels.map((p) =>
      p.id === panelId ? { ...p, sketchUrl: asset.imageUrl, sketchLibraryId: asset.id } : p,
    ),
    updatedAt: new Date().toISOString(),
  }
  const updated = await saveBoard(dialogId, userId, next, profile)
  return { dialog: updated, board: next }
}

export async function saveFilmPlan(
  dialogId: string,
  userId: string,
  plan: FilmPlan,
  profile?: UserProfile | null,
): Promise<Dialog> {
  const updated = await updateDialog(dialogId, userId, { filmPlan: plan }, profile)
  if (!updated) throw new Error('Film-Plan nicht gespeichert.')
  return updated
}
