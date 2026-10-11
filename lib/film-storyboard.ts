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
  resolveDraftSectionId,
  panelWantsOwnStill,
  insertPanelAfter,
  insertSceneAfter,
  isFilmStoryboard,
  normalizeFilmStoryboard,
  panelAddressee,
  type FilmDraftPanel,
  type FilmPlan,
  type FilmPlacement,
  type FilmScene,
  type FilmStoryboard,
  type FilmStoryboardPanel,
} from '../shared/film-storyboard.js'
import { generateCheapStoryboardSketch } from './film-sketch.js'
import { generateFilmPanelStillImage } from './film-stills.js'
import { libraryForCompose, rematchFilmBoard } from '../shared/film-library-harvest.js'
import {
  applyPanelHarvestNote,
  applyPanelStill,
  applyPanelStillError,
  correctionIsFaceOnly,
  correctionRewritesPerson,
  correctFromUrlForPanel,
  genderFromPictureNote,
  personNamedInCorrection,
  previousStillUrlInScene,
  replaceStillUrl,
  sceneContinuityBlock,
  sceneGrundbildPanel,
  sceneWidePanel,
  sceneWideStillUrl,
} from '../shared/film-stills.js'
import {
  applyPanelLayout,
  type ArrangeLayerUpdate,
} from '../shared/film-still-arrange.js'
import { ensurePanelPieces } from './film-panel-pieces.js'
import { DEFAULT_STORY_ART_STYLE, isStoryArtStyleId } from '../shared/story-art-styles.js'
import { speakerGender } from '../shared/speakers.js'
import { genderFromKnownName } from './speaker-gender.js'

function sittingFromPlacement(pl: FilmPlacement | undefined): boolean {
  if (!pl) return true
  return pl.poseId === 'sitting' || /sit/i.test(pl.poseHint || '')
}

function continuityEnFor(
  dialog: Dialog,
  panel: FilmStoryboardPanel,
  wide: FilmStoryboardPanel | undefined,
  speaker: string,
  correction?: string,
): string {
  const placements = (wide ?? panel).placements
  const names = [...new Set(placements.map((pl) => pl.name.trim()).filter(Boolean))]
  const genders: Record<string, 'male' | 'female' | undefined> = {}
  for (const name of names) {
    const fromNote =
      speaker && name.trim().toLowerCase() === speaker.trim().toLowerCase()
        ? genderFromPictureNote(correction)
        : undefined
    genders[name] = fromNote ?? speakerGender(dialog, name) ?? genderFromKnownName(name)
  }
  return sceneContinuityBlock({
    placements,
    speaker,
    addressee: panelAddressee(panel, dialog),
    lookNote: dialog.storyMeta?.lookNote,
    genders,
    stillCorrection: correction,
    hasGrundbild: Boolean(wide?.stillUrl || ((panel.shot ?? 'wide') !== 'closeup' && panel.stillUrl)),
  })
}

async function paintCloseupPushIn(opts: {
  panel: FilmStoryboardPanel
  scene?: FilmScene
  styleId: string
  wideUrl: string
  speakerGender?: 'male' | 'female'
  speakerX?: number
  speakerSitting: boolean
  continuityEn: string
  targetLanguage?: string
  beatTotal: number
}): Promise<string> {
  return generateFilmPanelStillImage({
    panel: { ...opts.panel, stillCorrection: undefined },
    scene: opts.scene,
    styleId: opts.styleId,
    previousStillUrl: undefined,
    correctFromUrl: undefined,
    targetLanguage: opts.targetLanguage,
    beatTotal: opts.beatTotal,
    sceneWideStillUrl: opts.wideUrl,
    speakerGender: opts.speakerGender,
    speakerX: opts.speakerX,
    speakerSitting: opts.speakerSitting,
    continuityEn: opts.continuityEn,
  })
}

const PLAN_SYSTEM = `Du planst ein Bilderbuch-Storyboard (Standbilder). Keine fertigen Film-Bilder.
Nur JSON.
Genau EIN Bild je Dialogzeile (lineIds: eine id).
Erstes Bild einer Szene shot="wide": ganzer Raum, ALLE Personen, Einrichtung wie der Dialog.
Weitere Zeilen: dasselbe Bild (imageCue z.B. «Wie das vorige Bild. Khan spricht.»), ausser die Zeile eine neue Aktion braucht (aufstehen, zur Tür, Nahaufnahme). Dann shot="closeup" nur wenn wirklich Nahaufnahme.
Schema:
{
  "summaryDe": "ein Satz",
  "panels": [
    {
      "sectionId": "id",
      "shot": "wide|closeup",
      "closeupSpeaker": "Name nur bei closeup",
      "lineIds": ["eine-zeilen-id"],
      "caption": "kurz",
      "imageCue": "was man sieht, oder Wie das vorige Bild",
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
      sectionId: resolveDraftSectionId(dialog, p.sectionId),
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

  const drafts = ensureCoverageDrafts(dialog, aiDrafts)
  const rebuilt = buildBoardFromDrafts(dialog, drafts, library, 'gemini', current, {
    freshPlaces: true,
  })
  const kept = current.panels.filter((p) => !wanted.has(p.sceneId) && !wanted.has(p.sectionId))
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
  const panel = correction
    ? { ...found, stillCorrection: correction, directorNote: correction }
    : found
  const working: FilmStoryboard = correction
    ? {
        ...board,
        panels: board.panels.map((p) => (p.id === panelId ? panel : p)),
      }
    : board
  const targetLanguage = dialog.filmPlan?.targetLanguage || dialog.targetLanguage
  let correctFromUrl = correctFromUrlForPanel(working, panel, correction)

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
    const scenePanels0 = working.panels.filter((p) => p.sceneId === panel.sceneId)
    if (!correction && !panelWantsOwnStill(panel, scenePanels0)) {
      const prevUrl = previousStillUrlInScene(working, panel)
      if (prevUrl) {
        const withStill = applyPanelStill(working, panelId, prevUrl, resolvedStyle)
        const withNote = applyPanelHarvestNote(
          withStill,
          panelId,
          'Dasselbe Bild wie die vorige Zeile — bis du etwas änderst.',
        )
        const updated = await persist(withNote)
        return { dialog: updated, board: withNote }
      }
    }
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
    if (!correctFromUrl && (panelForGen.shot ?? 'wide') !== 'closeup') {
      const prevUrl = previousStillUrlInScene(boardForGen, panelForGen)
      if (prevUrl) correctFromUrl = prevUrl
    }
    const grund = sceneGrundbildPanel(boardForGen, panelForGen.sceneId)
    const wide =
      grund && grund.id !== panelForGen.id
        ? grund
        : (panelForGen.shot ?? 'wide') === 'closeup'
          ? sceneWidePanel(boardForGen, panelForGen)
          : panelForGen
    const seatNames = (wide ?? panelForGen).placements.map((pl) => pl.name)
    const speaker =
      personNamedInCorrection(correction, seatNames) ||
      panelForGen.closeupSpeaker ||
      panelForGen.placements[0]?.name ||
      ''
    const whoOnWide = (wide ?? panelForGen).placements.find(
      (pl) => pl.name.trim().toLowerCase() === speaker.trim().toLowerCase(),
    )
    const continuityEn = continuityEnFor(dialog, panelForGen, wide, speaker, correction)
    const rewrite = Boolean(correction && correctionRewritesPerson(correction))
    const isCloseup = (panelForGen.shot ?? 'wide') === 'closeup'
    const grundUrl = grund?.stillUrl

    if (rewrite && isCloseup && grundUrl && grund) {
      const wideForGen: FilmStoryboardPanel = {
        ...grund,
        stillCorrection: correction,
        directorNote: correction,
        shot: 'wide',
      }
      const newWideUrl = await generateFilmPanelStillImage({
        panel: wideForGen,
        scene,
        styleId: resolvedStyle,
        previousStillUrl: undefined,
        correctFromUrl: grundUrl,
        targetLanguage,
        beatTotal,
        sceneWideStillUrl: grundUrl,
        speakerGender:
          genderFromPictureNote(correction) ??
          speakerGender(dialog, speaker) ??
          genderFromKnownName(speaker),
        speakerX: whoOnWide?.x,
        speakerSitting: sittingFromPlacement(whoOnWide),
        continuityEn,
      })
      let next = applyPanelStill(boardForGen, grund.id, newWideUrl, resolvedStyle)
      next = replaceStillUrl(next, grundUrl, newWideUrl, panelForGen.sceneId)
      const closeUrl = await paintCloseupPushIn({
        panel: panelForGen,
        scene,
        styleId: resolvedStyle,
        wideUrl: newWideUrl,
        speakerGender:
          genderFromPictureNote(correction) ??
          speakerGender(dialog, speaker) ??
          genderFromKnownName(speaker),
        speakerX: whoOnWide?.x,
        speakerSitting: sittingFromPlacement(whoOnWide),
        continuityEn,
        targetLanguage,
        beatTotal,
      })
      next = applyPanelStill(next, panelId, closeUrl, resolvedStyle)
      const withNote = applyPanelHarvestNote(
        next,
        panelId,
        `Neu gemalt: ${correction} — Kamera wechselt den Platz, nicht nur den Kopf.`,
      )
      const updated = await persist(withNote)
      return { dialog: updated, board: withNote }
    }

    if (isCloseup && !correctionIsFaceOnly(correction)) {
      correctFromUrl = undefined
    }
    const url = await generateFilmPanelStillImage({
      panel: panelForGen,
      scene,
      styleId: resolvedStyle,
      previousStillUrl: undefined,
      correctFromUrl,
      targetLanguage,
      beatTotal,
      sceneWideStillUrl: wide?.stillUrl ?? sceneWideStillUrl(boardForGen, panelForGen) ?? grundUrl,
      speakerGender:
        genderFromPictureNote(correction) ??
        speakerGender(dialog, speaker) ??
        genderFromKnownName(speaker),
      speakerX: whoOnWide?.x,
      speakerSitting: sittingFromPlacement(whoOnWide),
      continuityEn,
    })
    let withStill = applyPanelStill(boardForGen, panelId, url, resolvedStyle)
    if (rewrite && !isCloseup && panelForGen.stillUrl) {
      withStill = replaceStillUrl(withStill, panelForGen.stillUrl, url, panelForGen.sceneId)
    }
    const withNote = applyPanelHarvestNote(
      withStill,
      panelId,
      correction
        ? `Neu gemalt: ${correction} — gleicher Ort, gleiche Plätze.`
        : isCloseup
          ? `Nahaufnahme ${speaker}: Kamera wechselt den Platz — man schaut der Person ins Gesicht.`
          : pieceNote
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
