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
  ensureCoverageDrafts,
  closeupExprKey,
  findReusableCloseupPanel,
  insertPanelAfter,
  insertSceneAfter,
  isFilmStoryboard,
  normalizeFilmStoryboard,
  type FilmDraftPanel,
  type FilmPlan,
  type FilmStoryboard,
} from '../shared/film-storyboard.js'
import { generateCheapStoryboardSketch } from './film-sketch.js'
import { generateFilmPanelStillImage } from './film-stills.js'
import { libraryForCompose, rematchFilmBoard } from '../shared/film-library-harvest.js'
import {
  applyPanelLayout,
  type ArrangeLayerUpdate,
} from '../shared/film-still-arrange.js'
import { ensurePanelPieces } from './film-panel-pieces.js'
import {
  applyPanelHarvestNote,
  applyPanelStill,
  applyPanelStillError,
} from '../shared/film-stills.js'
import { DEFAULT_STORY_ART_STYLE, isStoryArtStyleId } from '../shared/story-art-styles.js'

const PLAN_SYSTEM = `Du planst ein Bilderbuch-Storyboard (Standbilder). Keine fertigen Film-Bilder.
Nur JSON.
Pro Szene/Abschnitt PFLICHT:
1. Genau EIN Bild shot="wide": ganzer Raum, ALLE Personen, Einrichtung GENAU wie der Dialog (Teppich, Tisch, Kissen …). Nicht ein beliebiges altes Wohnzimmer.
2. Danach genau EIN Bild shot="closeup" je Sprecher, der in der Szene spricht: Nahaufnahme Gesicht (Mund, Augenbrauen). Nur diese eine Person.
Nahaufnahmen derselben Person dürfen in späteren Szenen wiederverwendet werden — also nicht extra erfinden, wenn die Mimik gleich bleibt.
Schema:
{
  "summaryDe": "ein Satz",
  "panels": [
    {
      "sectionId": "id",
      "shot": "wide|closeup",
      "closeupSpeaker": "Name nur bei closeup",
      "lineIds": ["id"],
      "caption": "kurz",
      "imageCue": "was man sieht, inkl. Möbel/Ort aus dem Dialog",
      "soundCue": "Ton oder leer",
      "speechCue": "wie gesprochen",
      "settingHint": "Ort wie im Dialog, konkret",
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
- settingHint und imageCue beim Weit-Bild: konkrete Einrichtung aus dem Text, nicht nur «Wohnzimmer».`

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
  opts?: { cheapAi?: boolean; extra?: string; keepBoard?: boolean; freshPlaces?: boolean },
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog) throw new Error('Dialog nicht gefunden.')

  const library = libraryForCompose(await listStoryAssets(userId))
  const previous = opts?.keepBoard && isFilmStoryboard(dialog.filmStoryboard)
    ? normalizeFilmStoryboard(dialog.filmStoryboard)
    : undefined
  const useAi = opts?.cheapAi !== false
  const aiDrafts = useAi ? await draftsFromGemini(dialog, opts?.extra ?? '') : null
  const drafts = aiDrafts
    ? ensureCoverageDrafts(dialog, aiDrafts)
    : draftPanelsFromDialog(dialog)
  const board = buildBoardFromDrafts(
    dialog,
    drafts,
    library,
    aiDrafts ? 'gemini' : 'rules',
    previous,
    { freshPlaces: Boolean(opts?.freshPlaces) },
  )

  const updated = await saveBoard(dialogId, userId, board, profile)
  return { dialog: updated, board: updated.filmStoryboard as FilmStoryboard }
}

/** Alte Standbilder und den Bildplan löschen, dann nur aus dem Dialog neu planen. */
export async function resetFilmStoryboardFromDialog(
  dialogId: string,
  userId: string,
  profile?: UserProfile | null,
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog) throw new Error('Dialog nicht gefunden.')
  const wiped = await updateDialog(
    dialogId,
    userId,
    { filmStoryboard: null, filmPlan: null },
    profile,
  )
  if (!wiped) throw new Error('Alter Bildplan konnte nicht gelöscht werden.')
  return planFilmStoryboard(dialogId, userId, profile, {
    cheapAi: true,
    keepBoard: false,
    freshPlaces: true,
  })
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
  const library = libraryForCompose(await listStoryAssets(userId))
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
  const library = libraryForCompose(await listStoryAssets(userId))
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

export async function stillFilmPanel(
  dialogId: string,
  userId: string,
  panelId: string,
  styleId: string | undefined,
  profile?: UserProfile | null,
  note?: string,
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  const board = normalizeFilmStoryboard(dialog.filmStoryboard)
  const found = board.panels.find((p) => p.id === panelId)
  if (!found) throw new Error('Bild nicht gefunden.')
  const scene = board.scenes.find((s) => s.id === found.sceneId)
  const fromPlan = dialog.filmPlan?.scenes.find((s) => s.sceneId === found.sceneId)?.styleId
  const resolvedStyle =
    (styleId && isStoryArtStyleId(styleId) ? styleId : undefined) ||
    (fromPlan && isStoryArtStyleId(fromPlan) ? fromPlan : undefined) ||
    DEFAULT_STORY_ART_STYLE
  const correction = note?.trim()
  const panel = correction ? { ...found, stillCorrection: correction } : found
  const working: FilmStoryboard = correction
    ? {
        ...board,
        panels: board.panels.map((p) => (p.id === panelId ? panel : p)),
      }
    : board
  const targetLanguage = dialog.filmPlan?.targetLanguage || dialog.targetLanguage
  let correctFromUrl = correction && panel.stillUrl ? panel.stillUrl : undefined

  const planScenes = [...(dialog.filmPlan?.scenes ?? [])]
  const planIdx = planScenes.findIndex((s) => s.sceneId === panel.sceneId)
  if (planIdx >= 0) {
    planScenes[planIdx] = { ...planScenes[planIdx], styleId: resolvedStyle }
  } else {
    planScenes.push({ sceneId: panel.sceneId, styleId: resolvedStyle })
  }
  const filmPlan: FilmPlan = {
    version: 1,
    targetLanguage: dialog.filmPlan?.targetLanguage ?? dialog.targetLanguage,
    scenes: planScenes,
    timelineNotes: dialog.filmPlan?.timelineNotes ?? [],
    updatedAt: new Date().toISOString(),
  }

  const persist = async (nextBoard: FilmStoryboard) => {
    const updated = await updateDialog(
      dialogId,
      userId,
      { filmStoryboard: normalizeFilmStoryboard(nextBoard), filmPlan },
      profile,
    )
    if (!updated) throw new Error('Standbild konnte nicht gespeichert werden.')
    return updated
  }

  try {
    let boardForGen = working
    let panelForGen = panel
    let pieceNote = ''
    if (!correction) {
      try {
        const library0 = libraryForCompose(await listStoryAssets(userId))
        const pieces = await ensurePanelPieces({
          userId,
          panel,
          scene,
          styleId: resolvedStyle,
          library: library0,
        })
        pieceNote = pieces.noteDe
        boardForGen = rematchFilmBoard(working, libraryForCompose(pieces.library))
        panelForGen = boardForGen.panels.find((p) => p.id === panelId) ?? panel
      } catch {
        /* Ohne neue Teile: vorhandene Vorlagen nehmen. */
      }
    }
    const beatTotal = boardForGen.panels.filter((p) => p.sceneId === panelForGen.sceneId).length
    if (!correction && (panelForGen.shot ?? 'wide') === 'closeup') {
      const base = findReusableCloseupPanel(
        boardForGen,
        panelForGen.closeupSpeaker || panelForGen.placements[0]?.name || '',
        panelForGen.id,
      )
      if (base?.stillUrl) {
        const sameFace =
          closeupExprKey(base.expressionHint) === closeupExprKey(panelForGen.expressionHint)
        if (sameFace) {
          const withStill = applyPanelStill(boardForGen, panelId, base.stillUrl, resolvedStyle)
          const withNote = applyPanelHarvestNote(
            withStill,
            panelId,
            'Nahaufnahme schon da — dasselbe Gesicht wiederverwendet.',
          )
          const updated = await persist(withNote)
          return { dialog: updated, board: withNote }
        }
        panelForGen = {
          ...panelForGen,
          stillCorrection:
            panelForGen.stillCorrection ||
            `Keep this EXACT close-up (same crop, face, hair, clothes). Only change facial muscles: ${panelForGen.expressionHint || 'talking'}. Eyebrows, eyelids, mouth, maybe wrinkle the nose. Do not redraw the person.`,
        }
        correctFromUrl = base.stillUrl
      }
    }
    const url = await generateFilmPanelStillImage({
      panel: panelForGen,
      scene,
      styleId: resolvedStyle,
      previousStillUrl: undefined,
      correctFromUrl,
      targetLanguage,
      beatTotal,
    })
    const withStill = applyPanelStill(boardForGen, panelId, url, resolvedStyle)
    const withNote = applyPanelHarvestNote(
      withStill,
      panelId,
      pieceNote
        ? `${pieceNote} Die KI hat sie in dieses Bild gemalt — nicht ausgeschnitten.`
        : 'Die KI hat Raum und Figuren in dieses Bild gemalt.',
    )
    const updated = await persist(withNote)
    return { dialog: updated, board: withNote }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Standbild fehlgeschlagen.'
    const failed = applyPanelStillError(working, panelId, message)
    try {
      await saveBoard(dialogId, userId, failed, profile)
    } catch {
      /* Speichern des Fehlers ist optional */
    }
    throw new Error(message)
  }
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

export async function saveFilmPanelLayout(
  dialogId: string,
  userId: string,
  panelId: string,
  updates: ArrangeLayerUpdate[],
  profile?: UserProfile | null,
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) {
    throw new Error('Kein Storyboard.')
  }
  const board = applyPanelLayout(normalizeFilmStoryboard(dialog.filmStoryboard), panelId, updates)
  const updated = await saveBoard(dialogId, userId, board, profile)
  return { dialog: updated, board }
}

export async function rematchFilmLibrary(
  dialogId: string,
  userId: string,
  profile?: UserProfile | null,
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) {
    throw new Error('Kein Storyboard.')
  }
  const library = libraryForCompose(await listStoryAssets(userId))
  const board = rematchFilmBoard(normalizeFilmStoryboard(dialog.filmStoryboard), library)
  const updated = await saveBoard(dialogId, userId, board, profile)
  return { dialog: updated, board }
}
