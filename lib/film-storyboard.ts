import { chatJson, generateFilmSceneDialog, planStillEditPackzettel } from './ai.js'
import { newLineId } from './ids.js'
import { listStoryAssets, saveStoryAsset } from './story-library.js'
import { getDialog, updateDialog, type UserProfile } from './firestore.js'
import { isStageSpeaker, type Dialog, type FilmInventory } from '../shared/types.js'
import { deriveFilmInventory } from '../shared/film-inventory.js'
import {
  alignCueImageWithStillFix,
  alignDialogLineCueAfterStill,
  applyNativeFirstDraftLine,
  lineStoryText,
} from '../shared/film-dialog-native.js'
import {
  applyDirectorNote,
  applyPanelComment,
  applyPanelCues,
  applySceneNote,
  buildBoardFromDrafts,
  draftPanelsFromDialog,
  ensureCoverageDrafts,
  resolveDraftSectionId,
  panelWantsOwnStill,
  insertPanelAfter,
  insertSceneAfter,
  removeScene,
  removeScenesAfter,
  isFilmStoryboard,
  normalizeFilmStoryboard,
  panelAddressee,
  planBoardWithoutAi,
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
  markLaterPanelsStaleAfterCorrection,
  personNamedInCorrection,
  previousPlaceStillUrl,
  previousStillUrlInScene,
  replaceStillUrl,
  sceneContinuityBlock,
  panelPlaceKey,
  placeGrundbildPanel,
  stillReferencePack,
} from '../shared/film-stills.js'
import {
  applyPanelLayout,
  type ArrangeLayerUpdate,
} from '../shared/film-still-arrange.js'
import { ensurePanelPieces } from './film-panel-pieces.js'
import { DEFAULT_STORY_ART_STYLE, getStoryArtStyle, isStoryArtStyleId } from '../shared/story-art-styles.js'
import {
  catalogForPlanner,
  parseStillEditPackzettel,
  pickStillCatalogImages,
  stillEditCatalog,
  stillEditFigures,
  stillEditHarvestNoteDe,
  stillEditLineDe,
  stillNumberInScene,
  type StillEditPackzettel,
} from '../shared/film-still-pack.js'
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
  inventory?: FilmInventory | null
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
    inventory: opts.inventory,
  })
}

const PLAN_SYSTEM = `Du führst Regie für ein Bilderbuch-Storyboard (Standbilder). Keine fertigen Film-Bilder.
Nur JSON.
Genau EIN Bild je Dialogzeile (lineIds: eine id). Die Kamera darf NICHT immer denselben ganzen Raum zeigen.

Kamerawahl (shot) — intelligente Regie:
- shot="wide": EINMAL pro Szene das Grundbild, wenn Leute zusammenkommen oder der Raum zum ersten Mal da ist. Ganzer Raum, wer wo sitzt.
- shot="closeup" + closeupSpeaker: sobald jemand SPRICHT. Kamera auf das Gesicht dieser Person, nicht den ganzen Raum.
- shot="insert": Zwischenbild / Detail, wenn etwas PASSIERT ohne dass jemand spricht, oder ein Gegenstand wichtig ist. Beispiele: Tee zubereiten → Kanne und Hände; es klopft → die Tür füllt das Bild; Prospekt, Klingel, Blick aus dem Fenster.
Niemals «Wie das vorige Bild» für eine Sprechzeile oder eine Handlung. Jede Sprechzeile und jedes Zwischenbild braucht ein eigenes imageCue, das sagt was man SIEHT.

Schema:
{
  "summaryDe": "ein Satz",
  "panels": [
    {
      "sectionId": "id",
      "shot": "wide|closeup|insert",
      "closeupSpeaker": "Name nur bei closeup",
      "lineIds": ["eine-zeilen-id"],
      "caption": "kurz",
      "imageCue": "was man in DIESEM Bild sieht (Tür, Gesicht, Tee — nicht «wie zuvor»)",
      "soundCue": "Ton oder leer",
      "speechCue": "wie gesprochen, leer bei Handlung",
      "settingHint": "Ort wie im Dialog, konkret",
      "expressionHint": "freut sich|traurig|schreit|überrascht|neutral|leise / flüstert",
      "propIds": ["blumen-1"],
      "characters": [
        { "name": "Julien", "poseHint": "sitting|standing-front|waving|look-left|look-right|walking|standing-three-quarter", "depth": "foreground|mid|background", "x": 40 }
      ]
    }
  ]
}
Regeln:
- Namen unverändert.
- poseHint nur aus der Liste. Bei insert ohne Person: characters leer [].
- x 15–85.
- settingHint EIN Ort: Küche ODER Wohnzimmer ODER Tür — niemals beides in einem Bild.
- Weit-Bild der Gäste: Wohnzimmer. Tee auffüllen: Küche. Klopfen: Tür.
- Nur die Dialog-Abschnitte. Keine Extra-Szenen erfinden, die nicht im Dialog stehen.
- sectionId = die echte Abschnitts-Id aus dem Dialog.
- Handlung/Erzähler-Zeilen: shot=insert (oder wide wenn es wirklich der ganze Raum ist).
- soundCue bei Handlung IMMER das konkrete Geräusch: Wasser läuft in den Kessel, Kessel pfeift, Tee plätschert, Klopfen an der Tür — nicht nur «leise».
- Insert mit einer Person: nur diese Person einmal, keine Zwillinge. Weit-Bild mit Gästen: die Gäste müssen sichtbar sein, kein leeres Wohnzimmer.
- propIds: dieselben Requisiten-ids wie im Dialog. Was die Geschichte hergibt (Blumen, Kanne, Mantel, Zeitung) — dieselbe id, wenn der Gegenstand später wieder da ist.`

function flattenDialog(dialog: Dialog, extra = ''): string {
  const lines: string[] = [
    `Titel: ${dialog.title}`,
    `Muttersprache: ${dialog.sourceLanguage || 'de'}`,
    `Zielsprache: ${dialog.targetLanguage}`,
    dialog.filmPrompt ? `Film-Prompt:\n${dialog.filmPrompt}` : '',
    dialog.imageDirection ? `Bild-Regie: ${dialog.imageDirection}` : '',
    dialog.soundDirection ? `Ton-Regie: ${dialog.soundDirection}` : '',
    dialog.speechDirection ? `Sprach-Regie: ${dialog.speechDirection}` : '',
    extra,
  ]
  if (dialog.filmInventory) {
    lines.push(`Inventar (feste ids): ${JSON.stringify(dialog.filmInventory)}`)
  }
  lines.push('Szenen nur aus diesen Dialog-Abschnitten. Keine Extra-Szenen ohne neuen Dialog.')
  for (const section of dialog.sections) {
    lines.push(`Abschnitt ${section.id} «${section.title}»`)
    for (const line of section.lines) {
      lines.push(
        `- ${line.id} | ${line.kind || 'speech'} | ${line.speaker}: ${lineStoryText(line)}` +
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

/**
 * Erstes Planen und «Vom Text neu»: lokaler Plan, sofort speichern.
 * Gemini-Regie plus Vorlagen-KI (60 s+ FUNCTION_INVOCATION) darf die leere Seite nicht rot machen.
 * cheapAi/extra bleiben in der Signatur, werden hier nicht mehr abgewartet.
 */
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
  const board = previous
    ? buildBoardFromDrafts(
        dialog,
        draftPanelsFromDialog(dialog),
        library,
        'rules',
        previous,
        { freshPlaces: Boolean(opts?.freshPlaces) },
      )
    : planBoardWithoutAi(dialog, library)
  const inventory = deriveFilmInventory(dialog)

  const updated = await updateDialog(
    dialogId,
    userId,
    {
      filmStoryboard: normalizeFilmStoryboard(board),
      filmInventory: inventory,
    },
    profile,
  )
  if (!updated) throw new Error('Storyboard konnte nicht gespeichert werden.')
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
    cheapAi: false,
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

export async function cueFilmPanel(
  dialogId: string,
  userId: string,
  panelId: string,
  cues: { soundCue?: string; imageCue?: string; speechCue?: string },
  profile?: UserProfile | null,
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  const board = applyPanelCues(dialog.filmStoryboard, panelId, cues)
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

function pruneUnusedSections(
  dialog: Dialog,
  board: FilmStoryboard,
  removedPanels: FilmStoryboardPanel[],
): Dialog['sections'] {
  const keptLineIds = new Set(board.panels.flatMap((p) => p.lineIds ?? []))
  const removedLineIds = new Set(removedPanels.flatMap((p) => p.lineIds ?? []))
  const removedSceneIds = new Set(removedPanels.map((p) => p.sceneId))
  return dialog.sections.filter((section) => {
    if (section.lines.some((l) => keptLineIds.has(l.id))) return true
    if (removedSceneIds.has(section.id)) return false
    if (section.lines.length > 0 && section.lines.every((l) => removedLineIds.has(l.id))) {
      return false
    }
    return true
  })
}

export async function removeFilmScene(
  dialogId: string,
  userId: string,
  sceneId: string,
  profile?: UserProfile | null,
  opts?: { after?: boolean },
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  const current = normalizeFilmStoryboard(dialog.filmStoryboard)
  const board = opts?.after ? removeScenesAfter(current, sceneId) : removeScene(current, sceneId)
  if (board.scenes.length === current.scenes.length) {
    throw new Error(
      opts?.after
        ? 'Danach kommt keine weitere Szene.'
        : current.scenes.length <= 1
          ? 'Die letzte Szene kann man nicht löschen.'
          : 'Szene nicht gefunden.',
    )
  }
  const removedPanels = current.panels.filter((p) => !board.panels.some((keep) => keep.id === p.id))
  const sections = pruneUnusedSections(dialog, board, removedPanels)
  const updated = await updateDialog(
    dialogId,
    userId,
    { filmStoryboard: normalizeFilmStoryboard(board), sections },
    profile,
  )
  if (!updated) throw new Error('Szene konnte nicht entfernt werden.')
  return { dialog: updated, board: updated.filmStoryboard as FilmStoryboard }
}

export async function writeFilmSceneDialog(
  dialogId: string,
  userId: string,
  sceneId: string,
  profile?: UserProfile | null,
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  const current = normalizeFilmStoryboard(dialog.filmStoryboard)
  const scene = current.scenes.find((s) => s.id === sceneId)
  if (!scene) throw new Error('Szene nicht gefunden.')
  const sceneIdx = current.scenes.findIndex((s) => s.id === sceneId)
  const earlier = current.scenes.slice(0, Math.max(0, sceneIdx)).map((s) => {
    const section =
      dialog.sections.find((sec) => sec.id === s.id) ||
      dialog.sections[current.scenes.findIndex((x) => x.id === s.id)]
    return {
      title: s.title,
      lines: (section?.lines ?? []).map((l) => ({ speaker: l.speaker, text: l.text })),
    }
  })
  const speakers = [
    ...new Set(
      dialog.sections.flatMap((s) =>
        s.lines.map((l) => l.speaker.trim()).filter((name) => name && !isStageSpeaker(name)),
      ),
    ),
  ]
  const drafted = await generateFilmSceneDialog({
    sourceLanguage: dialog.sourceLanguage || 'de',
    targetLanguage: dialog.targetLanguage,
    sceneTitle: scene.title,
    sceneNote: scene.noteDe,
    filmPrompt: dialog.filmPrompt,
    imageDirection: dialog.imageDirection,
    earlier,
    speakers,
  })
  const newLines = drafted.map((l) =>
    applyNativeFirstDraftLine({
      id: newLineId(),
      kind: l.kind,
      speaker: l.speaker,
      text: l.text,
      cueImage: l.cueImage,
      cueSound: l.cueSound,
    }),
  )
  const existingIdx = dialog.sections.findIndex((s) => s.id === sceneId)
  const newSection = {
    id: sceneId,
    title: scene.title || `Szene ${sceneIdx + 1}`,
    lines: newLines,
  }
  const sections =
    existingIdx >= 0
      ? dialog.sections.map((s, i) => (i === existingIdx ? newSection : s))
      : [...dialog.sections, newSection]
  const nextDialog = { ...dialog, sections }
  const library = libraryForCompose(await listStoryAssets(userId))
  const drafts = ensureCoverageDrafts({ ...nextDialog, sections: [newSection] }, [])
  const rebuilt = buildBoardFromDrafts(
    { ...nextDialog, sections: [newSection] },
    drafts,
    library,
    'gemini',
    current,
  )
  const oldWide = current.panels.find((p) => p.sceneId === sceneId && p.stillUrl)
  const fresh = rebuilt.panels.map((p, i) => ({
    ...p,
    sceneId,
    sceneIndex: sceneIdx,
    stillUrl: i === 0 ? p.stillUrl || oldWide?.stillUrl : p.stillUrl,
  }))
  const board: FilmStoryboard = {
    ...current,
    panels: [...current.panels.filter((p) => p.sceneId !== sceneId), ...fresh],
    updatedAt: new Date().toISOString(),
  }
  const updated = await updateDialog(
    dialogId,
    userId,
    { filmStoryboard: normalizeFilmStoryboard(board), sections },
    profile,
  )
  if (!updated) throw new Error('Dialog der Szene konnte nicht gespeichert werden.')
  return { dialog: updated, board: updated.filmStoryboard as FilmStoryboard }
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

/** Nur Packzettel — eigener Request, damit Bild ändern nicht Planner+Bild in 60 s stopft. */
export async function planFilmPanelStillEdit(
  dialogId: string,
  userId: string,
  panelId: string,
  note: string,
  profile?: UserProfile | null,
  styleId?: string,
): Promise<StillEditPackzettel> {
  const correction = note.trim()
  if (!correction) {
    throw new Error('Schreib zuerst einen kurzen Hinweis, dann «Bild ändern».')
  }
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  const board = normalizeFilmStoryboard(dialog.filmStoryboard)
  const found = board.panels.find((p) => p.id === panelId)
  if (!found) throw new Error('Bild nicht gefunden.')
  const panel = { ...found, stillCorrection: correction, directorNote: correction }
  const working: FilmStoryboard = {
    ...board,
    panels: board.panels.map((p) => (p.id === panelId ? panel : p)),
  }
  const fromPlan = dialog.filmPlan?.scenes.find((s) => s.sceneId === found.sceneId)?.styleId
  const resolvedStyle =
    (styleId && isStoryArtStyleId(styleId) ? styleId : undefined) ||
    (fromPlan && isStoryArtStyleId(fromPlan) ? fromPlan : undefined) ||
    DEFAULT_STORY_ART_STYLE
  const inventory = dialog.filmInventory || deriveFilmInventory(dialog)
  const catalog = stillEditCatalog({
    board: working,
    panel,
    inventory,
  })
  return planStillEditPackzettel({
    stillNumber: stillNumberInScene(working, panel),
    panelId: panel.id,
    userHint: correction,
    dialogDe: stillEditLineDe(panel, dialog),
    figures: stillEditFigures(working, panel, inventory),
    place: panel.settingHint || panelPlaceKey(panel),
    catalog: catalogForPlanner(catalog),
    styleLabel: getStoryArtStyle(resolvedStyle).label,
  })
}

export async function stillFilmPanel(
  dialogId: string,
  userId: string,
  panelId: string,
  styleId: string | undefined,
  profile?: UserProfile | null,
  note?: string,
  packFromClient?: { imagePrompt?: string; imageIds?: string[] } | null,
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

  let nextSections = dialog.sections
  const persist = async (nextBoard: FilmStoryboard) => {
    const updated = await updateDialog(
      dialogId,
      userId,
      {
        filmStoryboard: normalizeFilmStoryboard(nextBoard),
        filmPlan,
        ...(correction ? { sections: nextSections } : {}),
      },
      profile,
    )
    if (!updated) throw new Error('Standbild konnte nicht gespeichert werden.')
    return updated
  }
  const finishAfterCorrection = (nextBoard: FilmStoryboard, panelNow: FilmStoryboardPanel) => {
    if (!correction) return nextBoard
    let next = applyPanelCues(nextBoard, panelId, {
      imageCue: alignCueImageWithStillFix(panelNow.imageCue, correction),
    })
    next = markLaterPanelsStaleAfterCorrection(next, panelId)
    nextSections = alignDialogLineCueAfterStill(nextSections, panelNow.lineIds[0], correction)
    return next
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
          'Dasselbe Bild wie die vorige Zeile — bis die Kamera wechselt.',
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
    if (correction) {
      const inventory = dialog.filmInventory || deriveFilmInventory(dialog)
      const catalog = stillEditCatalog({
        board: boardForGen,
        panel: panelForGen,
        inventory,
      })
      const packzettel = packFromClient?.imagePrompt
        ? parseStillEditPackzettel(packFromClient)
        : await planStillEditPackzettel({
            stillNumber: stillNumberInScene(boardForGen, panelForGen),
            panelId: panelForGen.id,
            userHint: correction,
            dialogDe: stillEditLineDe(panelForGen, dialog),
            figures: stillEditFigures(boardForGen, panelForGen, inventory),
            place: panelForGen.settingHint || panelPlaceKey(panelForGen),
            catalog: catalogForPlanner(catalog),
            styleLabel: getStoryArtStyle(resolvedStyle).label,
          })
      const picked = pickStillCatalogImages(catalog, packzettel.imageIds)
      const url = await generateFilmPanelStillImage({
        panel: panelForGen,
        scene,
        styleId: resolvedStyle,
        packzettel: {
          prompt: packzettel.imagePrompt,
          urls: picked.map((it) => it.url),
          labels: picked.map((it) => it.label),
        },
      })
      const withStill = applyPanelStill(boardForGen, panelId, url, resolvedStyle)
      const notedBoard = finishAfterCorrection(withStill, panelForGen)
      const withNote = applyPanelHarvestNote(
        notedBoard,
        panelId,
        stillEditHarvestNoteDe(correction, picked),
      )
      const updated = await persist(withNote)
      return { dialog: updated, board: withNote }
    }
    const beatTotal = boardForGen.panels.filter((p) => p.sceneId === panelForGen.sceneId).length
    const isInsert = (panelForGen.shot ?? 'wide') === 'insert'
    if (isInsert) {
      correctFromUrl = correction ? correctFromUrl : undefined
    }
    const grund = placeGrundbildPanel(boardForGen, panelForGen)
    const wide =
      grund && grund.id !== panelForGen.id ? grund : panelForGen
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
    const continuityForShot =
      isInsert
        ? 'INSERT: same house/location as this scene. Do not show the whole gathering unless the cue names it. Fill the frame with the named detail.'
        : continuityEn

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
        continuityEn: continuityForShot,
        inventory: dialog.filmInventory,
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
        inventory: dialog.filmInventory,
      })
      next = applyPanelStill(next, panelId, closeUrl, resolvedStyle)
      const withNote = applyPanelHarvestNote(
        finishAfterCorrection(next, panelForGen),
        panelId,
        `Neu gemalt: ${correction} — Kamera wechselt den Platz, nicht nur den Kopf.`,
      )
      const updated = await persist(withNote)
      return { dialog: updated, board: withNote }
    }

    if (isCloseup && !correctionIsFaceOnly(correction)) {
      correctFromUrl = undefined
    }
    const placeWideUrl = isInsert ? undefined : grund?.stillUrl
    const prevPlaceUrl = previousPlaceStillUrl(boardForGen, panelForGen)
    const pack = stillReferencePack(panelForGen, {
      previousStillUrl: prevPlaceUrl,
      correctFromUrl,
      sceneWideStillUrl: placeWideUrl,
      board: boardForGen,
      inventory: dialog.filmInventory,
    })
    const url = await generateFilmPanelStillImage({
      panel: panelForGen,
      scene,
      styleId: resolvedStyle,
      previousStillUrl: prevPlaceUrl,
      correctFromUrl,
      targetLanguage,
      beatTotal,
      sceneWideStillUrl: placeWideUrl,
      speakerGender:
        genderFromPictureNote(correction) ??
        speakerGender(dialog, speaker) ??
        genderFromKnownName(speaker),
      speakerX: whoOnWide?.x,
      speakerSitting: sittingFromPlacement(whoOnWide),
      continuityEn: continuityForShot,
      board: boardForGen,
      inventory: dialog.filmInventory,
    })
    let withStill = applyPanelStill(boardForGen, panelId, url, resolvedStyle)
    if (rewrite && !isCloseup && !isInsert && panelForGen.stillUrl) {
      withStill = replaceStillUrl(withStill, panelForGen.stillUrl, url, panelForGen.sceneId)
    }
    const notedBoard = correction ? finishAfterCorrection(withStill, panelForGen) : withStill
    const withNote = applyPanelHarvestNote(
      notedBoard,
      panelId,
      [
        pack.noteDe,
        correction
          ? `Neu gemalt: ${correction} — gleicher Ort, gleiche Plätze.`
          : isCloseup
            ? `Nahaufnahme ${speaker}: Kamera wechselt den Platz — man schaut der Person ins Gesicht.`
            : isInsert
              ? `Zwischenbild: ${panelForGen.imageCue || panelForGen.caption || 'Detail'} — nicht der ganze Raum.`
              : pieceNote
                ? `${pieceNote} Die KI hat sie in dieses Bild gemalt — nicht ausgeschnitten.`
                : 'Die KI hat Raum und Figuren in dieses Bild gemalt.',
      ]
        .filter(Boolean)
        .join(' '),
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
