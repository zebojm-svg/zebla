import { chatJson, generateFilmSceneDialog, planStillEditPackzettel } from './ai.js'
import { newLineId } from './ids.js'
import { listStoryAssets, saveStoryAsset } from './story-library.js'
import { getDialog, updateDialog, type UserProfile } from './firestore.js'
import { isNarratorName, isStageSpeaker, type Dialog, type DialogLine, type FilmInventory } from '../shared/types.js'
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
  applyPanelDirectorNote,
  insertPanelAfter,
  insertSceneAfter,
  reindexFilmPanels,
  removePanel,
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
import {
  mergeSceneReview,
  reviewSceneBatch,
  sceneReviewPending,
  SCENE_REVIEW_BATCH,
} from './film-scene-review.js'
import { applySceneReviewMarks, sceneReviewSummaryDe } from '../shared/film-scene-review.js'
import { generateCheapStoryboardSketch } from './film-sketch.js'
import { generateFilmPanelStillImage, paintRegiePlannedStill } from './film-stills.js'
import { planStoryPicture } from './film-regie-plan.js'
import {
  addRegieAttempt,
  setRegieAttemptVerdict,
  PAINTED_WITH_PLAN_DE,
  PAINTED_WITHOUT_PLAN_DE,
  regiePlanErrorLineDe,
  regiePlanSummaryDe,
  type FilmRegiePlan,
  type FilmRegiePlanRef,
  type RegieRefOption,
} from '../shared/film-regie-plan.js'
import {
  bestAttemptIndex,
  regieFoundError,
  REGIE_PASS,
  roomRefAllowed,
  cameraViewFromText,
  storedRegieCheck,
  uncheckedVerdict,
} from '../shared/film-regie-judge.js'
import {
  roomPlateFailedDe,
  roomPlateFor,
  roomPlateRoleDe,
  roomPlateStateDe,
  roomPlateUseEn,
  surfacePlateUseEn,
  withRoomPlate,
  type FilmRoomPlate,
} from '../shared/film-room-plate.js'
import {
  briefForImage,
  applyRegiebuchEdit,
  continuityIsCurrent,
  ensureFilmContinuity,
  ensureFilmContinuityRead,
  rereadFilmContinuity,
  ensureSpeakerPlate,
  judgeStoryStill,
  judgeRoomPlate,
  paintRoomPlate,
  roomPlateUrl,
  JUDGE_MAX_REFS,
  REGIEBUCH_STILLS_MAX,
  type RegiebuchStill,
  type RegieVerdict,
  jobsForLibrary,
  PortraitPreparePaused,
  runNextReferenceJob,
  placePlate,
  sidePlate,
  stampReferenceFaces,
  judgePortraitPlate,
  portraitFailedDe,
  portraitPaintUrl,
  portraitRefUrl,
} from './film-continuity.js'
import {
  directorStillUrls,
  placeForName,
  regiebuchFromContinuity,
  regiebuchVorgabenDe,
  type FilmContinuity,
  type RegiebuchEdit,
} from '../shared/film-continuity.js'
import { pickedCastUrl, type CatalogCast } from '../shared/catalog-cast.js'
import {
  portraitFor,
  portraitLookKey,
  portraitStateDe,
  withPortraitStamp,
  type FilmPortraitStamp,
} from '../shared/film-portrait-plate.js'
import type { StoryLibraryAsset } from '../shared/story-types.js'
import { libraryForCompose, rematchFilmBoard } from '../shared/film-library-harvest.js'
import {
  applyPanelHarvestNote,
  applyPanelStill,
  applyPanelStillError,
  correctionIsFaceOnly,
  correctionIsMoodOnly,
  correctionRewritesPerson,
  stillEditMoodOnlyLockEn,
  genderFromPictureNote,
  markLaterPanelsStaleAfterCorrection,
  personNamedInCorrection,
  previousPlaceStillUrl,
  previousStillUrlInScene,
  replaceStillUrl,
  sceneContinuityBlock,
  isVideoCallSituation,
  videoCallFrameEn,
  panelPlaceKey,
  placeGrundbildPanel,
  stillReferencePack,
} from '../shared/film-stills.js'
import {
  applyPanelLayout,
  type ArrangeLayerUpdate,
} from '../shared/film-still-arrange.js'
import { ensurePanelPieces } from './film-panel-pieces.js'
import { DEFAULT_STORY_ART_STYLE, getStoryArtStyle, isStoryArtStyleId, paintingStyleId } from '../shared/story-art-styles.js'
import {
  blockedStillUrlsForHint,
  catalogForPlanner,
  filterStillEditCatalogForHint,
  packRefIsRoomLayoutOnly,
  parseExcludedStillPackRefs,
  stillEditCatalog,
  stillEditFigures,
  stillEditImageErrorDe,
  stillEditLineDe,
  panelByStillPackNumber,
  stillPackNumber,
  stillUrlForPackRef,
  type StillEditPackzettel,
} from '../shared/film-still-pack.js'
import {
  applyPanelRefApproval,
  approveAllSceneRefs,
  assertRefApprovalForGeneration,
  blockedPackNumbersFromHint,
  filterRegiePlanRefs,
  generationBlockedByRefApproval,
  refNotApprovedMessageDe,
  suggestRefApprovalsFromBoard,
  stillUrlOkAsRefSource,
  type RefApprovalBlock,
} from '../shared/film-ref-approval.js'
import { applyLineSpeaker, speakerGender } from '../shared/speakers.js'
import { genderFromKnownName } from './speaker-gender.js'

function situationTextFor(dialog: Dialog, sceneId: string): string {
  const section = dialog.sections.find((s) => s.id === sceneId)
  const lines = (section?.lines ?? [])
    .map((line) => [line.cueImage, line.text, line.nativeText].filter(Boolean).join(' '))
    .join(' ')
  return [dialog.imageDirection, dialog.filmPrompt, section?.title, lines].filter(Boolean).join(' ')
}

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
  situationText?: string
  continuityBriefEn?: string
  directorRefs?: Array<{ url: string; name: string; role?: 'grundbild' | 'identity' }>
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
    situationText: opts.situationText,
    continuityBriefEn: opts.continuityBriefEn,
    directorRefs: opts.directorRefs,
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
  opts?: {
    cheapAi?: boolean
    extra?: string
    keepBoard?: boolean
    freshPlaces?: boolean
    carry?: FilmContinuity
  },
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog) throw new Error('Dialog nicht gefunden.')
  const carry =
    opts?.carry ?? (isFilmStoryboard(dialog.filmStoryboard) ? dialog.filmStoryboard.continuity : undefined)

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
    : planBoardWithoutAi(dialog, library, { freshPlaces: true })
  const inventory = deriveFilmInventory(dialog)
  const withBook = carry?.byUser ? { ...board, continuity: carry } : board

  const updated = await updateDialog(
    dialogId,
    userId,
    {
      filmStoryboard: normalizeFilmStoryboard(withBook),
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
  const carry = isFilmStoryboard(dialog.filmStoryboard) ? dialog.filmStoryboard.continuity : undefined
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
    carry,
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

function insertDialogLineAfter(
  dialog: Dialog,
  sectionId: string,
  afterLineId: string | undefined,
  line: DialogLine,
): Dialog {
  const hasSection = dialog.sections.some((s) => s.id === sectionId)
  if (!hasSection) {
    return {
      ...dialog,
      sections: [
        ...dialog.sections,
        { id: sectionId, title: sectionId, lines: [line] },
      ],
    }
  }
  return {
    ...dialog,
    sections: dialog.sections.map((section) => {
      if (section.id !== sectionId) return section
      const lines = [...section.lines]
      const at = afterLineId ? lines.findIndex((l) => l.id === afterLineId) : -1
      if (at >= 0) lines.splice(at + 1, 0, line)
      else lines.push(line)
      return { ...section, lines }
    }),
  }
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
  const current = normalizeFilmStoryboard(dialog.filmStoryboard)
  const after = current.panels.find((p) => p.id === afterPanelId) ?? current.panels[current.panels.length - 1]
  if (!after) throw new Error('Bild nicht gefunden.')
  const lineId = newLineId()
  const line = applyNativeFirstDraftLine({
    id: lineId,
    speaker: '',
    kind: 'action',
    text: text.trim(),
    nativeText: text.trim(),
    cueImage: text.trim(),
  })
  const afterLineId = after.lineIds?.[after.lineIds.length - 1]
  const nextDialog = insertDialogLineAfter(
    dialog,
    after.sectionId || after.sceneId,
    afterLineId,
    line,
  )
  const board = reindexFilmPanels(
    insertPanelAfter(current, afterPanelId, text, library, { lineIds: [lineId] }),
  )
  const updated = await updateDialog(
    dialogId,
    userId,
    { filmStoryboard: board, sections: nextDialog.sections },
    profile,
  )
  if (!updated) throw new Error('Storyboard konnte nicht gespeichert werden.')
  return { dialog: updated, board: updated.filmStoryboard as FilmStoryboard }
}

export async function removeFilmPanel(
  dialogId: string,
  userId: string,
  panelId: string,
  profile?: UserProfile | null,
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  const current = normalizeFilmStoryboard(dialog.filmStoryboard)
  const found = current.panels.find((p) => p.id === panelId)
  if (!found) throw new Error('Bild nicht gefunden.')
  if (current.panels.length <= 1) {
    throw new Error('Das letzte Bild kann man nicht löschen.')
  }
  const board = removePanel(current, panelId)
  if (board.panels.length === current.panels.length) {
    throw new Error('Bild nicht gefunden.')
  }
  const removedPanels = current.panels.filter((p) => p.id === panelId)
  const sections = pruneUnusedSections(dialog, board, removedPanels)
  const updated = await updateDialog(
    dialogId,
    userId,
    { filmStoryboard: normalizeFilmStoryboard(board), sections },
    profile,
  )
  if (!updated) throw new Error('Bild konnte nicht gelöscht werden.')
  return { dialog: updated, board: updated.filmStoryboard as FilmStoryboard }
}

export async function saveFilmPack(
  dialogId: string,
  userId: string,
  panelId: string,
  fields: {
    speaker?: string | null
    imageCue?: string
    directorNote?: string
    soundCue?: string
    nativeText?: string
    stillCorrection?: string | null
    stillMarkRedo?: boolean | null
    refApprovedByUser?: boolean | null
  },
  profile?: UserProfile | null,
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  let board = normalizeFilmStoryboard(dialog.filmStoryboard)
  const found = board.panels.find((p) => p.id === panelId)
  if (!found) throw new Error('Bild nicht gefunden.')
  let sections = dialog.sections
  let lineId = found.lineIds?.[0]
  const wantsLine =
    fields.speaker !== undefined || fields.nativeText !== undefined || fields.imageCue !== undefined

  if (wantsLine && !lineId) {
    lineId = newLineId()
    const speaker = (fields.speaker ?? '').trim()
    const spoken = (fields.nativeText ?? found.caption ?? fields.imageCue ?? '').trim()
    const line = applyLineSpeaker(
      applyNativeFirstDraftLine({
        id: lineId,
        speaker,
        text: spoken,
        nativeText: spoken,
        cueImage: fields.imageCue ?? found.imageCue,
      }),
      speaker,
    )
    const afterLineId = undefined
    const nextDialog = insertDialogLineAfter(
      { ...dialog, sections },
      found.sectionId || found.sceneId,
      afterLineId,
      line,
    )
    sections = nextDialog.sections
    board = {
      ...board,
      panels: board.panels.map((p) => (p.id === panelId ? { ...p, lineIds: [lineId!] } : p)),
    }
  } else if (lineId && (fields.speaker !== undefined || fields.nativeText !== undefined)) {
    sections = sections.map((section) => ({
      ...section,
      lines: section.lines.map((line) => {
        if (line.id !== lineId) return line
        let next = line
        if (fields.speaker !== undefined) {
          next = applyLineSpeaker(next, fields.speaker ?? '')
        }
        if (fields.nativeText !== undefined) {
          const native = fields.nativeText.trim()
          if (next.kind === 'action' || !next.kind) {
            next = { ...next, text: native, nativeText: native, audioUrl: undefined }
          } else {
            next = { ...next, nativeText: native, audioUrl: undefined }
          }
        }
        return next
      }),
    }))
  }

  if (fields.imageCue !== undefined) {
    board = applyPanelCues(board, panelId, { imageCue: fields.imageCue })
    const cue = fields.imageCue.trim()
    board = {
      ...board,
      panels: board.panels.map((p) => {
        if (p.id !== panelId) return p
        const silent = !p.closeupSpeaker && !(fields.speaker ?? '').trim()
        return silent && cue ? { ...p, caption: p.caption?.trim() ? p.caption : cue } : p
      }),
    }
    if (lineId) {
      sections = sections.map((section) => ({
        ...section,
        lines: section.lines.map((line) =>
          line.id === lineId ? { ...line, cueImage: fields.imageCue!.trim() } : line,
        ),
      }))
    }
  }
  if (fields.soundCue !== undefined) {
    board = applyPanelCues(board, panelId, { soundCue: fields.soundCue })
  }
  if (fields.directorNote !== undefined) {
    board = applyPanelDirectorNote(board, panelId, fields.directorNote)
  }
  if (fields.refApprovedByUser !== undefined && fields.refApprovedByUser !== null) {
    board = applyPanelRefApproval(board, panelId, Boolean(fields.refApprovedByUser))
  }
  if (fields.stillCorrection !== undefined || fields.stillMarkRedo !== undefined) {
    const correction =
      fields.stillCorrection === undefined || fields.stillCorrection === null
        ? undefined
        : fields.stillCorrection.trim()
    board = {
      ...board,
      panels: board.panels.map((p) => {
        if (p.id !== panelId) return p
        const mark =
          fields.stillMarkRedo !== undefined && fields.stillMarkRedo !== null
            ? Boolean(fields.stillMarkRedo)
            : correction
              ? true
              : p.stillMarkRedo
        return {
          ...p,
          ...(fields.stillCorrection !== undefined
            ? { stillCorrection: correction || undefined }
            : {}),
          stillMarkRedo: mark ? true : undefined,
        }
      }),
    }
  }
  if (fields.speaker !== undefined) {
    const speaker = (fields.speaker || '').trim()
    const spoken = speaker && !isStageSpeaker(speaker) && !isNarratorName(speaker) ? speaker : speaker && isNarratorName(speaker) ? 'Erzähler' : undefined
    board = {
      ...board,
      panels: board.panels.map((p) =>
        p.id === panelId
          ? {
              ...p,
              closeupSpeaker: spoken,
            }
          : p,
      ),
    }
  }

  const updated = await updateDialog(
    dialogId,
    userId,
    { filmStoryboard: normalizeFilmStoryboard(board), sections },
    profile,
  )
  if (!updated) throw new Error('Päckchen konnte nicht gespeichert werden.')
  return { dialog: updated, board: updated.filmStoryboard as FilmStoryboard }
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
  const resolvedStyle = paintingStyleId(
    (styleId && isStoryArtStyleId(styleId) ? styleId : undefined) ||
      (fromPlan && isStoryArtStyleId(fromPlan) ? fromPlan : undefined) ||
      DEFAULT_STORY_ART_STYLE,
  )
  const inventory = dialog.filmInventory || deriveFilmInventory(dialog)
  const catalog = filterStillEditCatalogForHint(
    stillEditCatalog({
      board: working,
      panel,
      inventory,
    }),
    working,
    correction,
  )
  return planStillEditPackzettel({
    stillNumber: stillPackNumber(working, panel),
    panelId: panel.id,
    userHint: correction,
    dialogDe: stillEditLineDe(panel, dialog),
    figures: stillEditFigures(working, panel, inventory),
    place: panel.settingHint || panelPlaceKey(panel),
    catalog: catalogForPlanner(catalog),
    styleLabel: getStoryArtStyle(resolvedStyle).label,
  })
}

function panelLinesDe(dialog: Dialog, panel: FilmStoryboardPanel): string {
  const lines = dialog.sections.flatMap((section) => section.lines)
  const said = panel.lineIds
    .map((id) => lines.find((line) => line.id === id))
    .filter((line): line is DialogLine => Boolean(line))
    .map((line) => `${line.speaker}: ${lineStoryText(line)}${line.cueImage ? ` (${line.cueImage})` : ''}`)
  const text = said.length ? said.join('\n') : panel.caption
  return [text, panel.imageCue ? `Bild-Hinweis: ${panel.imageCue}` : ''].filter(Boolean).join('\n')
}

/** Eine echte Person, nicht «Handlung» oder «Erzähler». */
function panelPersonName(panel: FilmStoryboardPanel): string {
  return (
    [panel.closeupSpeaker, ...panel.placements.map((item) => item.name)]
      .map((name) => (name || '').trim())
      .find((name) => name && !isStageSpeaker(name) && !isNarratorName(name)) ?? ''
  )
}

function boardShotDe(panel: FilmStoryboardPanel): string {
  const shot = panel.shot ?? 'wide'
  const stage = isStageSpeaker(panel.closeupSpeaker) || isNarratorName(panel.closeupSpeaker)
  if (shot === 'closeup' && stage) {
    return 'Regieanweisung ohne Sprecher: du entscheidest aus der Handlung, wer oder was nah zu sehen ist'
  }
  const who = panelPersonName(panel)
  return shot === 'closeup'
    ? `nah auf ${who || 'die Person, die spricht'}`
    : shot === 'insert'
      ? 'Detail, nicht der ganze Ort'
      : `weit${panel.settingHint ? `, Ort laut Board ${panel.settingHint}` : ''}`
}

function earlierPanelDe(panel: FilmStoryboardPanel, number: number): string {
  const what = panel.regiePlan
    ? regiePlanSummaryDe(panel.regiePlan)
    : `ohne Plan gemalt, Ort unbekannt; Board: ${boardShotDe(panel)}`
  const check = panel.regieCheck && panel.regieCheck.stillUrl === panel.stillUrl ? panel.regieCheck : undefined
  const wrong = !regieFoundError(check)
    ? ''
    : roomRefAllowed(check)
      ? ` — Regie fand einen Fehler, aber nicht am Raum: ${check!.noteDe}`
      : ` — Regie fand einen Fehler: ${check!.noteDe}`
  return `Bild ${number} «${panel.caption}»: ${what}${wrong}`
}

/** Die Regie plant ein Bild, bevor es gemalt wird. Eigene Anfrage, damit Planen, Malen und Anschauen je unter drei Minuten bleiben. */
export async function planFilmPanel(
  dialogId: string,
  userId: string,
  panelId: string,
  profile?: UserProfile | null,
): Promise<{
  dialog: Dialog
  board: FilmStoryboard
  planned: boolean
  reused?: boolean
  errorDe?: string
  refApprovalBlock?: RefApprovalBlock
}> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  const board = normalizeFilmStoryboard(dialog.filmStoryboard)
  const index = board.panels.findIndex((item) => item.id === panelId)
  const panel = board.panels[index]
  if (!panel) throw new Error('Bild nicht gefunden.')
  const scenePanels = board.panels.filter((item) => item.sceneId === panel.sceneId)
  if (!panelWantsOwnStill(panel, scenePanels) && previousStillUrlInScene(board, panel)) {
    return { dialog, board, planned: false, reused: true }
  }
  let continuity = board.continuity
  continuity = continuity ?? (await ensureFilmContinuity(dialog, board))
  const block = generationBlockedByRefApproval(board, panelId, { continuity })
  if (block) {
    return { dialog, board, planned: false, refApprovalBlock: block }
  }
  let read: Awaited<ReturnType<typeof planStoryPicture>>
  try {
    read = await askRegieForPlan(dialog, board, panel, index, continuity, userId)
  } catch (err) {
    const message = err instanceof Error ? err.message.trim() : ''
    read = { errorDe: message.slice(0, 200) || 'Unbekannter Fehler beim Planen.' }
  }
  const next: FilmStoryboard = {
    ...board,
    ...(continuity ? { continuity } : {}),
    panels: board.panels.map((item) =>
      item.id === panel.id ? { ...item, regiePlan: read.plan, regiePlanError: read.errorDe } : item,
    ),
  }
  const updated = await updateDialog(dialogId, userId, { filmStoryboard: normalizeFilmStoryboard(next) }, profile)
  if (!updated || !isFilmStoryboard(updated.filmStoryboard)) throw new Error('Der Plan der Regie konnte nicht gespeichert werden.')
  return { dialog: updated, board: updated.filmStoryboard, planned: Boolean(read.plan), errorDe: read.errorDe }
}

async function askRegieForPlan(
  dialog: Dialog,
  board: FilmStoryboard,
  panel: FilmStoryboardPanel,
  index: number,
  continuity: FilmContinuity,
  userId: string,
  edit?: { hintDe?: string },
) {
  const scenePanels = board.panels.filter((item) => item.sceneId === panel.sceneId)
  const library = libraryForCompose(await listStoryAssets(userId).catch(() => []))
  const picks = dialog.catalogCast
  const options: RegieRefOption[] = []
  const offer = (url: string | undefined, aboutDe: string) => {
    if (!url?.startsWith('http') || options.some((option) => option.url === url)) return
    options.push({ id: `V${options.length + 1}`, url, aboutDe })
  }
  for (const person of continuity.people) {
    offer(
      portraitPaintUrl(continuity, library, picks ?? null, person.name, person.lookEn) ||
        portraitRefUrl(library, picks ?? null, person.name),
      `Stammbild von ${person.name}, von vorne, ohne Raum.`,
    )
    offer(sidePlate(library, person.name)?.imageUrl, `Seitenansicht von ${person.name}, ohne Raum.`)
  }
  for (const place of continuity.places) {
    offer(
      roomPlateUrl(continuity, library, picks, place.name) || placePlate(library, place.name)?.imageUrl,
      `Raumbild «${place.name}», leer, ohne Leute: die feste Einrichtung. Geht immer mit, wenn das Bild an diesem Ort spielt.`,
    )
  }
  const hint = edit?.hintDe?.trim()
  const blocked = blockedStillUrlsForHint(board, hint)
  const earlier = board.panels
    .slice(0, index)
    .filter(
      (item) =>
        item.stillUrl?.startsWith('http') &&
        !blocked.has(item.stillUrl as string) &&
        stillUrlOkAsRefSource(board, item.stillUrl),
    )
  const shown = new Set<string>()
  const recent = [...earlier].reverse().filter((item) => {
    if (shown.has(item.stillUrl as string)) return false
    shown.add(item.stillUrl as string)
    return true
  })
  for (const item of recent.slice(0, 8).reverse()) {
    offer(
      item.stillUrl,
      `Früheres fertiges ${earlierPanelDe(item, stillPackNumber(board, item))}`,
    )
  }
  if (hint && panel.stillUrl?.startsWith('http')) {
    offer(
      panel.stillUrl,
      `Das bisherige Bild zu diesem Päckchen — Jean-Marie will es ändern: ${hint}. Nicht kopieren, ausser der Hinweis verlangt «wie in Bild …».`,
    )
  }
  const refWarnParts: string[] = []
  if (hint) {
    const { blocked: blockedByApproval, messages } = blockedPackNumbersFromHint(board, hint)
    if (messages.length) refWarnParts.push(...messages)
    const named = stillUrlForPackRef(board, hint, panel.stillUrl)
    if (named?.startsWith('http') && named !== panel.stillUrl && !blocked.has(named)) {
      const namedPack = board.panels.find((item) => item.stillUrl === named)
      const namedNum = namedPack ? stillPackNumber(board, namedPack) : 0
      const roomOnly = namedNum > 0 && packRefIsRoomLayoutOnly(hint, namedNum)
      offer(
        named,
        roomOnly
          ? `Nur Raum/Layout von Bild ${namedNum} (einmalig, ohne Freigabe) — Möbel und Wände, keine Gesichter von dort übernehmen.`
          : 'Ein anderes Bild-Päckchen, das Jean-Marie im Hinweis nannte — nur für Aussehen oder Haltung, nicht als Raum-Vorlage.',
      )
    } else if (blockedByApproval.length) {
      for (const n of blockedByApproval) {
        const url = panelByStillPackNumber(board, n)?.stillUrl
        if (url && !blocked.has(url)) {
          refWarnParts.push(refNotApprovedMessageDe(n))
        }
      }
    }
  }
  const sceneBefore = scenePanels.filter((item) => item.panelIndex < panel.panelIndex)
  const sceneAfter = scenePanels.filter((item) => item.panelIndex > panel.panelIndex)
  const read = await planStoryPicture({
    continuity,
    linesDe: panelLinesDe(dialog, panel),
    beforeDe: sceneBefore.slice(-2).map((item) => panelLinesDe(dialog, item)).join('\n'),
    afterDe: sceneAfter.slice(0, 2).map((item) => panelLinesDe(dialog, item)).join('\n'),
    shotDe: boardShotDe(panel),
    earlierDe: sceneBefore
      .map((item) => earlierPanelDe(item, stillPackNumber(board, item)))
      .join('\n'),
    options,
    hintDe: hint,
    excludedPackNumbers: hint ? parseExcludedStillPackRefs(hint) : [],
  })
  if (!read.plan) return read
  const filteredRefs = filterRegiePlanRefs(board, read.plan.refs, hint)
  const dropped = read.plan.refs.length - filteredRefs.length
  const warnPieces = [...refWarnParts]
  if (dropped > 0) {
    warnPieces.push(
      'Manche früheren Bilder wollte die Regie mitnehmen — die sind noch nicht als Vorlage freigegeben. Es gehen nur Raumbilder und Stammbilder mit.',
    )
  }
  const warnDe = warnPieces.length ? [...new Set(warnPieces)].join(' ') : undefined
  return {
    plan: {
      ...read.plan,
      refs: filteredRefs,
      ...(warnDe ? { warnDe } : {}),
    },
  }
}

/** Die Regie schaut ein fertiges Bild an. Eigene Anfrage, damit Malen und Anschauen je unter drei Minuten bleiben. */
export async function judgeFilmPanel(
  dialogId: string,
  userId: string,
  panelId: string,
  profile?: UserProfile | null,
  opts?: { pickBest?: boolean },
): Promise<{ dialog: Dialog; board: FilmStoryboard; verdict: RegieVerdict; pickedAttempt?: number }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  const board = normalizeFilmStoryboard(dialog.filmStoryboard)
  const index = board.panels.findIndex((item) => item.id === panelId)
  const panel = board.panels[index]
  if (!panel?.stillUrl?.startsWith('http')) return { dialog, board, verdict: uncheckedVerdict('Kein Bild da') }
  const earlier = board.panels.slice(0, index).filter((item) => item.stillUrl?.startsWith('http'))
  const before = earlier[earlier.length - 1]
  if (before?.sceneId === panel.sceneId && before.stillUrl === panel.stillUrl) {
    return { dialog, board, verdict: REGIE_PASS }
  }
  const attempt = [...(panel.regieAttempts ?? [])].reverse().find((item) => item.stillUrl === panel.stillUrl)
  const plan = panel.regiePlan
  const continuity = board.continuity ?? (await ensureFilmContinuity(dialog, board))
  const library = libraryForCompose(await listStoryAssets(userId).catch(() => []))
  let verdict = await judgeStoryStill({
    imageUrl: panel.stillUrl,
    regiebuchDe: regiebuchVorgabenDe(regiebuchFromContinuity(continuity)),
    linesDe: {
      before: index > 0 ? panelLinesDe(dialog, board.panels[index - 1]!) : '',
      now: panelLinesDe(dialog, panel),
      after: board.panels[index + 1] ? panelLinesDe(dialog, board.panels[index + 1]!) : '',
    },
    planDe: plan ? regiePlanSummaryDe(plan) : boardShotDe(panel),
    paintEn: plan?.paintEn,
    plannedCameraText: plan ? (cameraViewFromText(plan.cameraDe) ? plan.cameraDe : plan.cameraEn) : undefined,
    refs: judgeRefs({ board, index, continuity, library, picks: dialog.catalogCast }),
    nearCopyOfUrl: attempt?.copyOf && !plan?.sameFraming ? attempt.copyOf : undefined,
  })
  let stillUrl = panel.stillUrl
  const attempts = setRegieAttemptVerdict(panel.regieAttempts, stillUrl, { ...storedRegieCheck(verdict), seenDe: verdict.seenDe })
  let pickedAttempt: number | undefined
  if (opts?.pickBest && verdict.checked && !verdict.ok) {
    const best = bestAttemptIndex(attempts)
    const chosen = best >= 0 ? attempts?.[best] : undefined
    if (chosen && chosen.stillUrl !== stillUrl && chosen.verdict) {
      stillUrl = chosen.stillUrl
      pickedAttempt = best + 1
      verdict = {
        ...verdict,
        ok: chosen.verdict.ok,
        noteDe: chosen.verdict.noteDe,
        failed: (chosen.verdict.failed ?? []) as RegieVerdict['failed'],
        softDe: chosen.verdict.softDe ?? '',
        seenDe: chosen.verdict.seenDe ?? '',
        model: chosen.verdict.model,
        modelNoteDe: chosen.verdict.modelNoteDe,
        fixEn: '',
        freshRefs: false,
      }
    }
  }
  const next: FilmStoryboard = {
    ...board,
    continuity,
    panels: board.panels.map((item) =>
      item.id === panel.id
        ? {
            ...item,
            stillUrl,
            regieCheck: { ...storedRegieCheck(verdict), stillUrl },
            regieAttempts: attempts,
          }
        : item,
    ),
  }
  const updated = await updateDialog(dialogId, userId, { filmStoryboard: normalizeFilmStoryboard(next) }, profile)
  if (!updated || !isFilmStoryboard(updated.filmStoryboard)) throw new Error('Das Urteil der Regie konnte nicht gespeichert werden.')
  return { dialog: updated, board: updated.filmStoryboard, verdict, ...(pickedAttempt ? { pickedAttempt } : {}) }
}

/**
 * Was die Regie zum Vergleichen mitbekommt, höchstens JUDGE_MAX_REFS Bilder:
 * voriges Bild, Raum-Vorlage, Stammbilder aller Leute im Bild, ein früheres Bild vom selben Ort,
 * der Ort auf einer Fläche, ein Bild von einem anderen Ort als Warnung.
 */
function judgeRefs(opts: {
  board: FilmStoryboard
  index: number
  continuity: FilmContinuity
  library: StoryLibraryAsset[]
  picks?: CatalogCast | null
}): Array<{ url: string; roleDe: string }> {
  const { board, index, continuity, library, picks } = opts
  const panel = board.panels[index]!
  const plan = panel.regiePlan
  const refs: Array<{ url: string; roleDe: string }> = []
  const add = (url: string | undefined, roleDe: string) => {
    if (!url?.startsWith('http') || url === panel.stillUrl || refs.some((ref) => ref.url === url)) return
    if (refs.length < JUDGE_MAX_REFS) refs.push({ url, roleDe })
  }
  const roomPlate = (name: string) => roomPlateUrl(continuity, library, picks, name)
  if (plan?.place) add(roomPlate(plan.place), roomPlateRoleDe(plan.place))
  const prev = board.panels[index - 1]
  if (prev?.stillUrl && stillUrlOkAsRefSource(board, prev.stillUrl)) {
    add(
      prev.stillUrl,
      `Voriges Bild (Bild ${index}). ${prev.regiePlan ? `Damals: ${regiePlanSummaryDe(prev.regiePlan)}` : ''} Zum Vergleich für «neu» und für den Anschluss.`,
    )
  }
  const roomNames = continuity.places.map((item) => item.name)
  const room = (name: string) => (placeForName(roomNames, name) ?? name).trim().toLowerCase()
  const placeOf = (item: FilmStoryboardPanel) => (item.regiePlan?.place ? room(item.regiePlan.place) : '')
  const who = plan
    ? [...plan.bodies, ...plan.screens]
    : [panelPersonName(panel)].filter(Boolean)
  for (const name of who.slice(0, 3)) {
    const look =
      continuity.people.find((person) => person.name.trim().toLowerCase() === name.trim().toLowerCase())?.lookEn ?? ''
    const paintUrl = portraitPaintUrl(continuity, library, picks ?? null, name, look)
    const refUrl = paintUrl || portraitRefUrl(library, picks ?? null, name)
    add(
      refUrl,
      paintUrl
        ? `Stammbild von ${name}.`
        : `Stammbild von ${name} — passt eventuell nicht zum Regiebuch; Kleidung genau vergleichen.`,
    )
  }
  const earlier = board.panels.slice(0, index).filter((item) => item.stillUrl?.startsWith('http'))
  const usable = (item: FilmStoryboardPanel) =>
    item.stillUrl !== panel.stillUrl &&
    stillUrlOkAsRefSource(board, item.stillUrl) &&
    roomRefAllowed(item.regieCheck && item.regieCheck.stillUrl === item.stillUrl ? item.regieCheck : undefined)
  if (plan?.place) {
    const here = room(plan.place)
    const samePlace = [...earlier].reverse().find((item) => usable(item) && placeOf(item) === here)
    if (samePlace?.stillUrl) {
      add(
        samePlace.stillUrl,
        `Früheres Bild am selben Ort ${plan.place}. Damals: ${regiePlanSummaryDe(samePlace.regiePlan as FilmRegiePlan)}`,
      )
    }
    for (const surface of plan.surfaces ?? []) {
      if (!surface.place || room(surface.place) === here) continue
      add(roomPlate(surface.place), `Raum-Vorlage «${surface.place}»: dieser Ort ist auf ${surface.thing} zu sehen, nur dort.`)
    }
    const shownOnSurface = new Set((plan.surfaces ?? []).map((surface) => (surface.place ? room(surface.place) : '')))
    const otherPlaces = new Set<string>()
    for (const item of [...earlier].reverse()) {
      const there = placeOf(item)
      if (!there || there === here || otherPlaces.has(there) || !usable(item) || !item.stillUrl) continue
      otherPlaces.add(there)
      const name = placeForName(roomNames, item.regiePlan?.place ?? '') ?? item.regiePlan?.place
      add(
        item.stillUrl,
        shownOnSurface.has(there)
          ? `Anderer Ort «${name}». Als Raum um die Kamera darf er hier nicht erscheinen; laut Plan ist er nur auf einer Fläche zu sehen.`
          : `Anderer Ort «${name}» — darf hier nicht erscheinen, weder als Raum noch auf einer Fläche.`,
      )
      if (otherPlaces.size >= 1) break
    }
  } else {
    for (const item of directorStillUrls(board.panels, continuity, panel.id, (url) =>
      stillUrlOkAsRefSource(board, url),
    )) {
      add(item.url, `Früheres Bild: ${item.name}`)
    }
  }
  return refs
}

/** Höchstens zwei gutgeheissene Bilder je Person, damit das Regiebuch zum Gemalten passt. */
function regiebuchStills(board: FilmStoryboard): RegiebuchStill[] {
  const out: RegiebuchStill[] = []
  const perPerson = new Map<string, number>()
  for (const panel of board.panels) {
    const url = panel.stillUrl
    if (!url?.startsWith('http') || out.some((item) => item.url === url)) continue
    if (!(panel.regieCheck?.ok && panel.regieCheck.stillUrl === url)) continue
    const people = panel.regiePlan
      ? [...panel.regiePlan.bodies, ...panel.regiePlan.screens]
      : [panelPersonName(panel)].filter(Boolean)
    const wanted = people.filter((name) => (perPerson.get(name.toLowerCase()) ?? 0) < 2)
    if (!wanted.length) continue
    for (const name of wanted) perPerson.set(name.toLowerCase(), (perPerson.get(name.toLowerCase()) ?? 0) + 1)
    const room = panel.regiePlan?.place
      ? (placeForName(board.continuity?.places.map((item) => item.name) ?? [], panel.regiePlan.place) ?? panel.regiePlan.place)
      : ''
    const where = room ? ` am Ort ${room}` : ''
    out.push({ url, aboutDe: `zeigt ${people.join(', ')}${where}` })
    if (out.length >= REGIEBUCH_STILLS_MAX) break
  }
  return out
}

/** Regiebuch: die Regie liest (fresh = noch einmal), oder sie übernimmt Jean-Maries Änderung. */
export async function regiebuchFilm(
  dialogId: string,
  userId: string,
  opts: { edit?: RegiebuchEdit; fresh?: boolean },
  profile?: UserProfile | null,
): Promise<{ dialog: Dialog; board: FilmStoryboard; errorDe?: string }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Zuerst «Bilder planen».')
  const board = normalizeFilmStoryboard(dialog.filmStoryboard)
  const got: { continuity?: FilmContinuity; errorDe?: string } = opts.edit
    ? await applyRegiebuchEdit(dialog, board, opts.edit)
    : opts.fresh
      ? await rereadFilmContinuity(dialog, board, { stills: regiebuchStills(board) })
      : { continuity: await ensureFilmContinuity(dialog, board) }
  if (!got.continuity) {
    return { dialog, board, errorDe: got.errorDe || 'Grund unbekannt' }
  }
  const continuity = got.continuity
  const updated = await updateDialog(
    dialogId,
    userId,
    { filmStoryboard: normalizeFilmStoryboard({ ...board, continuity }) },
    profile,
  )
  if (!updated || !isFilmStoryboard(updated.filmStoryboard)) {
    throw new Error('Das Regiebuch konnte nicht gespeichert werden.')
  }
  return { dialog: updated, board: updated.filmStoryboard }
}

/**
 * «Raumbild neu zeichnen» / «Raumbild ändern» im Regiebuch. Eine Anfrage: zeichnen, dann schaut die Regie einmal hin.
 * Gespeichert wird auf dem frischen Stand, nur das Raumbild dieses Ortes ändert sich.
 */
export async function redrawRoomPlate(
  dialogId: string,
  userId: string,
  placeName: string,
  opts: { note?: string; styleId?: string; profile?: UserProfile | null },
): Promise<{ dialog: Dialog; board: FilmStoryboard; noteDe: string }> {
  const started = Date.now()
  const dialog = await getDialog(dialogId, userId, opts.profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  const board = normalizeFilmStoryboard(dialog.filmStoryboard)
  const continuity = board.continuity
  const place = continuity?.places.find((item) => item.name.trim().toLowerCase() === placeName.trim().toLowerCase())
  if (!continuity || !place) throw new Error(`Den Ort «${placeName}» gibt es im Regiebuch nicht.`)
  const old = roomPlateFor(continuity.plates, place.name)
  const fromPlan = dialog.filmPlan?.scenes.find((scene) => scene.styleId)?.styleId
  const style = paintingStyleId(
    (opts.styleId && isStoryArtStyleId(opts.styleId) ? opts.styleId : undefined) ||
      (fromPlan && isStoryArtStyleId(fromPlan) ? fromPlan : undefined) ||
      DEFAULT_STORY_ART_STYLE,
  )
  const hint = opts.note?.trim()
  let painted: Awaited<ReturnType<typeof paintRoomPlate>>
  try {
    painted = await paintRoomPlate({
      userId,
      name: place.name,
      lookEn: place.lookEn,
      styleId: isStoryArtStyleId(style) ? style : undefined,
      ...(hint && old ? { change: { fromUrl: old.url, hintDe: hint } } : {}),
      ...(hint && !old ? { fixEn: hint } : {}),
    })
  } catch (err) {
    throw new Error(roomPlateFailedDe(place.name, err instanceof Error ? err.message.slice(0, 160) : ''), { cause: err })
  }
  const left = 170_000 - (Date.now() - started)
  const checked =
    left > 45_000
      ? await judgeRoomPlate({ url: painted.asset.imageUrl as string, name: place.name, lookEn: place.lookEn, timeoutMs: left - 15_000 })
      : null
  const plate: FilmRoomPlate = {
    place: place.name,
    url: painted.asset.imageUrl as string,
    assetId: painted.asset.id,
    tries: (old?.tries ?? 0) + 1,
    byUser: true,
    ...(hint ? { hintDe: hint } : {}),
    ...(checked
      ? { checked: true, ok: checked.ok, noteDe: checked.noteDe, fixEn: checked.fixEn, model: checked.model }
      : {}),
    at: new Date().toISOString(),
  }
  const fresh = await getDialog(dialogId, userId, opts.profile)
  if (!fresh || !isFilmStoryboard(fresh.filmStoryboard)) throw new Error('Kein Storyboard.')
  const freshBoard = normalizeFilmStoryboard(fresh.filmStoryboard)
  const nextBoard: FilmStoryboard = {
    ...freshBoard,
    continuity: {
      ...(freshBoard.continuity ?? continuity),
      plates: withRoomPlate((freshBoard.continuity ?? continuity).plates, plate),
    },
  }
  const updated = await updateDialog(dialogId, userId, { filmStoryboard: normalizeFilmStoryboard(nextBoard) }, opts.profile)
  if (!updated || !isFilmStoryboard(updated.filmStoryboard)) throw new Error('Das Raumbild konnte nicht gespeichert werden.')
  const paintedHere = freshBoard.panels.some(
    (panel) => panel.stillUrl && panel.regiePlan?.place?.trim().toLowerCase() === place.name.trim().toLowerCase(),
  )
  return {
    dialog: updated,
    board: updated.filmStoryboard,
    noteDe: [
      `Raumbild «${place.name}» neu gezeichnet.`,
      checked ? roomPlateStateDe(plate) : 'Die Regie konnte es noch nicht anschauen; sie macht das vor dem nächsten Bild.',
      paintedHere ? 'Bilder, die schon an diesem Ort gemalt sind, haben noch die alte Einrichtung: «Ganze Szene neu erzeugen» malt sie nach dem neuen Raumbild.' : '',
    ]
      .filter(Boolean)
      .join(' '),
  }
}

/** «Stammbild neu zeichnen» im Regiebuch — Kleidung und Haare wie im lookEn. */
export async function redrawSpeakerPortrait(
  dialogId: string,
  userId: string,
  personName: string,
  opts: { note?: string; styleId?: string; profile?: UserProfile | null },
): Promise<{ dialog: Dialog; board: FilmStoryboard; noteDe: string }> {
  const dialog = await getDialog(dialogId, userId, opts.profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  const board = normalizeFilmStoryboard(dialog.filmStoryboard)
  const continuity = board.continuity
  const person = continuity?.people.find(
    (item) => item.name.trim().toLowerCase() === personName.trim().toLowerCase(),
  )
  if (!continuity || !person) throw new Error(`Die Person «${personName}» steht nicht im Regiebuch.`)
  const fromPlan = dialog.filmPlan?.scenes.find((scene) => scene.styleId)?.styleId
  const style = paintingStyleId(
    (opts.styleId && isStoryArtStyleId(opts.styleId) ? opts.styleId : undefined) ||
      (fromPlan && isStoryArtStyleId(fromPlan) ? fromPlan : undefined) ||
      DEFAULT_STORY_ART_STYLE,
  )
  const library0 = libraryForCompose(await listStoryAssets(userId))
  let lookEn = person.lookEn
  if (opts.note?.trim()) lookEn = `${lookEn}\nChange note: ${opts.note.trim()}`
  let plated: Awaited<ReturnType<typeof ensureSpeakerPlate>>
  try {
    plated = await ensureSpeakerPlate({
      userId,
      library: library0,
      name: person.name,
      lookEn,
      styleId: isStoryArtStyleId(style) ? style : undefined,
      pickedIds: dialog.catalogCast?.personIds,
      continuity,
      force: true,
    })
  } catch (err) {
    throw new Error(portraitFailedDe(person.name, err instanceof Error ? err.message.slice(0, 160) : ''), { cause: err })
  }
  const checked = plated.imageUrl
    ? await judgePortraitPlate({ url: plated.imageUrl, name: person.name, lookEn: person.lookEn })
  : null
  const old = portraitFor(continuity.portraitStamps, person.name)
  const stamp: FilmPortraitStamp = {
    name: person.name,
    lookKey: portraitLookKey(person.lookEn),
    url: plated.imageUrl as string,
    tries: (old?.tries ?? 0) + 1,
    byUser: true,
    ...(opts.note?.trim() ? { hintDe: opts.note.trim() } : {}),
    at: new Date().toISOString(),
    ...(checked
      ? { checked: true, ok: checked.ok, noteDe: checked.noteDe, fixEn: checked.fixEn, model: checked.model }
      : { checked: true, ok: true, noteDe: 'Neu gezeichnet. Die Regie konnte noch nicht vergleichen.' }),
  }
  const nextBoard: FilmStoryboard = {
    ...board,
    continuity: {
      ...(plated.continuity ?? continuity),
      portraitStamps: withPortraitStamp((plated.continuity ?? continuity).portraitStamps, stamp),
    },
  }
  const updated = await updateDialog(dialogId, userId, { filmStoryboard: normalizeFilmStoryboard(nextBoard) }, opts.profile)
  if (!updated || !isFilmStoryboard(updated.filmStoryboard)) {
    throw new Error('Das Stammbild konnte nicht gespeichert werden.')
  }
  return {
    dialog: updated,
    board: updated.filmStoryboard,
    noteDe: [
      `Stammbild von ${person.name} neu gezeichnet.`,
      portraitStateDe(stamp),
      'Die nächsten Bilder nehmen dieses Referenzbild.',
    ].join(' '),
  }
}

/** Ein Referenzbild oder ein Vergleich. Die Seite ruft das so oft auf, bis alles steht. */
export async function prepareFilmReferences(
  dialogId: string,
  userId: string,
  styleId: string | undefined,
  profile?: UserProfile | null,
  opts?: { skipPlates?: boolean },
): Promise<{
  dialog: Dialog
  board: FilmStoryboard
  pending: number
  didDe: string
  done: boolean
  plateErrorDe?: string
  portraitErrorDe?: string
}> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  let board = normalizeFilmStoryboard(dialog.filmStoryboard)
  if (!continuityIsCurrent(dialog, board)) {
    const got = await ensureFilmContinuityRead(dialog, board, { budgetMs: 120_000 })
    const saved = await updateDialog(
      dialogId,
      userId,
      { filmStoryboard: normalizeFilmStoryboard({ ...board, continuity: got.continuity }) },
      profile,
    )
    if (!saved || !isFilmStoryboard(saved.filmStoryboard)) throw new Error('Das Regiebuch konnte nicht gespeichert werden.')
    return {
      dialog: saved,
      board: saved.filmStoryboard,
      pending: 1,
      didDe: got.errorDe
        ? `Die Regie konnte die Geschichte nicht lesen: ${got.errorDe.replace(/[.\s]+$/, '')}. Das bisherige Regiebuch bleibt.`
        : 'Die Regie hat die Geschichte gelesen.',
      done: false,
    }
  }
  const continuity = await ensureFilmContinuity(dialog, board)
  board = { ...board, continuity }
  const library = libraryForCompose(await listStoryAssets(userId))
  const picks = dialog.catalogCast
  const isPlateJob = (job: { kind: string } | undefined) => job?.kind === 'place' || job?.kind === 'place-check'
  const open = (c: FilmContinuity, l: typeof library) =>
    jobsForLibrary(c, l, picks).filter((job) => !(opts?.skipPlates && isPlateJob(job)))
  const next = open(continuity, library)[0]
  let step: { library: typeof library; continuity: FilmContinuity; didDe: string }
  try {
    step = !next
      ? {
          library,
          continuity,
          didDe: opts?.skipPlates ? 'Die Referenzen stehen. Ohne Raumbild weiter, wie gewählt.' : 'Die Referenzen stehen.',
        }
      : await runNextReferenceJob({
          userId,
          library,
          continuity,
          styleId: paintingStyleId(styleId),
          picks,
        })
  } catch (err) {
    if (err instanceof PortraitPreparePaused) {
      return {
        dialog,
        board,
        pending: open(continuity, library).length,
        didDe: err.messageDe,
        done: false,
        portraitErrorDe: err.messageDe,
      }
    }
    if (!isPlateJob(next)) throw err
    const reason = err instanceof Error ? err.message : ''
    const plateErrorDe = roomPlateFailedDe(next!.name, reason.replace(/https?:\/\/\S+/g, '').slice(0, 160))
    return { dialog, board, pending: open(continuity, library).length, didDe: plateErrorDe, done: false, plateErrorDe }
  }
  board = { ...board, continuity: step.continuity }
  const pending = open(step.continuity, step.library).length
  const updated = await updateDialog(
    dialogId,
    userId,
    { filmStoryboard: normalizeFilmStoryboard(board) },
    profile,
  )
  if (!updated || !isFilmStoryboard(updated.filmStoryboard)) {
    throw new Error('Die Referenzen konnten nicht gespeichert werden.')
  }
  return {
    dialog: updated,
    board: updated.filmStoryboard,
    pending,
    didDe: step.didDe,
    done: pending === 0,
  }
}

export async function stillFilmPanel(
  dialogId: string,
  userId: string,
  panelId: string,
  styleId: string | undefined,
  profile?: UserProfile | null,
  note?: string,
  regie?: { fixEn: string; freshRefs: boolean },
  planErrorDe?: string,
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  const loaded = normalizeFilmStoryboard(dialog.filmStoryboard)
  const board: FilmStoryboard = planErrorDe
    ? {
        ...loaded,
        panels: loaded.panels.map((p) =>
          p.id === panelId ? { ...p, regiePlan: undefined, regiePlanError: planErrorDe } : p,
        ),
      }
    : loaded
  const found = board.panels.find((p) => p.id === panelId)
  if (!found) throw new Error('Bild nicht gefunden.')
  const scene = board.scenes.find((s) => s.id === found.sceneId)
  const fromPlan = dialog.filmPlan?.scenes.find((s) => s.sceneId === found.sceneId)?.styleId
  const resolvedStyle = paintingStyleId(
    (styleId && isStoryArtStyleId(styleId) ? styleId : undefined) ||
      (fromPlan && isStoryArtStyleId(fromPlan) ? fromPlan : undefined) ||
      DEFAULT_STORY_ART_STYLE,
  )
  const correction = note?.trim()
  let panel = correction
    ? { ...found, stillCorrection: correction, directorNote: correction, regiePlanError: undefined }
    : found
  const continuityForRefs = board.continuity ?? (await ensureFilmContinuity(dialog, board))
  assertRefApprovalForGeneration(board, panelId, { continuity: continuityForRefs, hint: correction })
  let working: FilmStoryboard = correction
    ? {
        ...board,
        panels: board.panels.map((p) => (p.id === panelId ? panel : p)),
      }
    : board
  const targetLanguage = dialog.filmPlan?.targetLanguage || dialog.targetLanguage
  /** Bild ändern = erstes Paket, ohne das aktuelle Tischbild als GROUNDBILD. */
  let correctFromUrl: string | undefined

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
  const firstTry = !correction && !regie?.fixEn
  const withAttempt = (
    nextBoard: FilmStoryboard,
    stillUrl: string,
    planned: boolean,
    refs: Array<{ url: string; useEn: string }>,
    copyOf?: string,
  ): FilmStoryboard => ({
    ...nextBoard,
    panels: nextBoard.panels.map((p) =>
      p.id === panelId
        ? {
            ...p,
            regieAttempts: addRegieAttempt(
              p.regieAttempts,
              {
                stillUrl,
                at: new Date().toISOString(),
                planned,
                ...(regie?.fixEn ? { fixEn: regie.fixEn } : {}),
                ...(correction ? { hintDe: correction } : {}),
                ...(copyOf ? { copyOf } : {}),
                refs,
              },
              firstTry,
            ),
          }
        : p,
    ),
  })
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
    let planForPaint: FilmRegiePlan | undefined = !correction ? panel.regiePlan : undefined
    if (correction) {
      const at = working.panels.findIndex((item) => item.id === panelId)
      const continuity = working.continuity ?? (await ensureFilmContinuity(dialog, working))
      working = { ...working, continuity }
      const read = await askRegieForPlan(dialog, working, panel, at, continuity, userId, { hintDe: correction })
      if (read.plan) {
        planForPaint = read.plan
        working = {
          ...working,
          panels: working.panels.map((item) =>
            item.id === panelId ? { ...item, regiePlan: read.plan, regiePlanError: undefined } : item,
          ),
        }
        panel = working.panels.find((item) => item.id === panelId) ?? panel
      } else if (panel.regiePlan) {
        planForPaint = panel.regiePlan
      } else {
        throw new Error(read.errorDe || 'Die Regie konnte den Hinweis nicht planen.')
      }
    }
    if (planForPaint) {
      const plan = planForPaint
      const paintedUrls = new Set(working.panels.map((item) => item.stillUrl).filter(Boolean))
      const copied = regie?.fixEn ? panel.regieAttempts?.[panel.regieAttempts.length - 1]?.copyOf : undefined
      const refBlocked = correction ? blockedStillUrlsForHint(working, correction) : new Set<string>()
      const chosen = filterRegiePlanRefs(
        working,
        (regie?.freshRefs ? plan.refs.filter((ref) => !paintedUrls.has(ref.url)) : plan.refs)
          .filter((ref) => ref.url !== copied)
          .filter((ref) => !refBlocked.has(ref.url)),
        correction,
      )
      const plateLibrary = libraryForCompose(await listStoryAssets(userId).catch(() => []))
      const plateOf = (name: string) => roomPlateUrl(working.continuity, plateLibrary, dialog.catalogCast, name)
      const cameraPlate = plan.place ? plateOf(plan.place) : undefined
      const plateRefs: FilmRegiePlanRef[] = []
      if (cameraPlate) plateRefs.push({ id: 'R1', url: cameraPlate, useEn: roomPlateUseEn(plan.place) })
      for (const surface of plan.surfaces ?? []) {
        if (!surface.place || surface.place.trim().toLowerCase() === plan.place.trim().toLowerCase()) continue
        const url = plateOf(surface.place)
        if (url && !plateRefs.some((ref) => ref.url === url) && plateRefs.length < 2) {
          plateRefs.push({ id: `R${plateRefs.length + 1}`, url, useEn: surfacePlateUseEn(surface.place, surface.thing) })
        }
      }
      const refs = [...plateRefs, ...chosen.filter((ref) => !plateRefs.some((plate) => plate.url === ref.url))]
      const at = working.panels.findIndex((item) => item.id === panelId)
      const prevStill = at > 0 ? working.panels[at - 1]?.stillUrl : undefined
      const compareUrls = plan.sameFraming
        ? []
        : [
            ...(correction && panel.stillUrl?.startsWith('http') ? [panel.stillUrl] : []),
            prevStill,
            ...refs.map((ref) => ref.url),
          ].filter(
            (url): url is string =>
              Boolean(url?.startsWith('http')) &&
              (paintedUrls.has(url as string) || url === panel.stillUrl) &&
              !refBlocked.has(url as string) &&
              stillUrlOkAsRefSource(working, url as string),
          )
      const fixEn = [
        regie?.fixEn,
        correction,
        correction && correctionIsMoodOnly(correction) ? stillEditMoodOnlyLockEn(correction) : '',
      ]
        .filter(Boolean)
        .join(' ')
      const painted = await paintRegiePlannedStill({
        plan: { ...plan, refs },
        continuity: working.continuity ?? (await ensureFilmContinuity(dialog, working)),
        styleId: resolvedStyle,
        targetLanguage,
        fixEn: fixEn || undefined,
        compareUrls,
        roomPlateUrl: cameraPlate,
      })
      const url = painted.url
      let nextBoard = withAttempt(applyPanelStill(working, panelId, url, resolvedStyle), url, true, refs, painted.copyOf)
      if (correction) nextBoard = finishAfterCorrection(nextBoard, panel)
      const withNote = applyPanelHarvestNote(
        nextBoard,
        panelId,
        [
          PAINTED_WITH_PLAN_DE,
          correction ? `Bild ändern nach Hinweis: ${correction}. Regie, Raumbild und Vorlagen wie beim ersten Malen.` : '',
          regie?.fixEn ? 'Neu gemalt, weil die Regie einen Fehler gesehen hat.' : '',
          cameraPlate
            ? `Raumbild «${plan.place}» mitgeschickt: Einrichtung bleibt fest.`
            : plan.place
              ? `Ohne Raumbild «${plan.place}»: die Einrichtung kann von Bild zu Bild abweichen.`
              : '',
          chosen.length ? `Dazu ${chosen.length} Vorlage${chosen.length === 1 ? '' : 'n'}, von der Regie gewählt.` : '',
          painted.copyOf ? 'Fast gleich wie ein früheres Bild.' : '',
        ]
          .filter(Boolean)
          .join(' '),
      )
      const updated = await persist(withNote)
      return { dialog: updated, board: withNote }
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
    const situationText = situationTextFor(dialog, panelForGen.sceneId)
    const isInsert = (panelForGen.shot ?? 'wide') === 'insert'
    if (isInsert) {
      correctFromUrl = correction ? correctFromUrl : undefined
    }
    const grund = placeGrundbildPanel(boardForGen, panelForGen)
    const wide =
      grund && grund.id !== panelForGen.id ? grund : panelForGen
    const seatNames = (wide ?? panelForGen).placements.map((pl) => pl.name)
    const speaker = personNamedInCorrection(correction, seatNames) || panelPersonName(panelForGen)
    const storyContinuity = await ensureFilmContinuity(dialog, boardForGen)
    const regieFix = !correction && regie?.fixEn ? regie.fixEn : ''
    const fresh = Boolean(regieFix && regie?.freshRefs)
    const continuityBriefEn = regieFix
      ? `DIRECTOR FIX for this picture, the last try was wrong: ${regieFix} ${briefForImage(storyContinuity)}`
      : briefForImage(storyContinuity)
    boardForGen = { ...boardForGen, continuity: storyContinuity }
    let faceLibrary = libraryForCompose(await listStoryAssets(userId).catch(() => []))
    if (!correction && speaker && !isNarratorName(speaker) && !isStageSpeaker(speaker)) {
      try {
        const look = storyContinuity.people.find(
          (person) => person.name.trim().toLowerCase() === speaker.trim().toLowerCase(),
        )
        const plated = await ensureSpeakerPlate({
          userId,
          library: faceLibrary,
          name: speaker,
          lookEn: look?.lookEn || speaker,
          styleId: resolvedStyle,
          pickedIds: dialog.catalogCast?.personIds,
          continuity: storyContinuity,
        })
        faceLibrary = plated.library
        if (plated.continuity) boardForGen = { ...boardForGen, continuity: plated.continuity }
        panelForGen = stampReferenceFaces(
          panelForGen,
          plated.library,
          dialog.catalogCast?.personIds,
          boardForGen.continuity,
        )
        boardForGen = {
          ...boardForGen,
          panels: boardForGen.panels.map((item) => (item.id === panelForGen.id ? panelForGen : item)),
        }
      } catch {
        /* Ohne neues Stammbild bleibt der Regie-Satz. */
      }
    }
    const videoCall = isVideoCallSituation(continuityBriefEn, situationText)
    const videoHost = (panelPersonName(panelForGen) || speaker).trim()
    const hostStill = videoCall
      ? [...boardForGen.panels]
          .slice(0, boardForGen.panels.findIndex((item) => item.id === panelForGen.id))
          .reverse()
          .find(
            (item) =>
              item.stillUrl?.startsWith('http') &&
              stillUrlOkAsRefSource(boardForGen, item.stillUrl) &&
              (item.closeupSpeaker || item.placements[0]?.name || '').trim().toLowerCase() ===
                videoHost.toLowerCase(),
          )?.stillUrl
      : undefined
    const refBlocked = correction ? blockedStillUrlsForHint(boardForGen, correction) : new Set<string>()
    const directorRefs = [
      ...(fresh
        ? []
        : videoCall
        ? hostStill && !refBlocked.has(hostStill)
          ? [{
              url: hostStill,
              name: `Früheres Bild von ${videoHost}: gleiche Kleidung, gleiches Headset, gleiche Möbel. Keine zweite Person übernehmen.`,
              role: 'identity' as const,
            }]
          : []
        : directorStillUrls(
            boardForGen.panels,
            storyContinuity,
            panelForGen.id,
            (url) => stillUrlOkAsRefSource(boardForGen, url) && !refBlocked.has(url),
          )
            .filter((item) => !refBlocked.has(item.url))
            .map((item) => ({
              url: item.url,
              name: item.name,
              role: 'grundbild' as const,
            }))),
      ...panelForGen.placements.flatMap((placement) => {
        const side = sidePlate(faceLibrary, placement.name)
        if (!side?.imageUrl) return []
        const onScreen =
          videoCall && placement.name.trim().toLowerCase() !== videoHost.toLowerCase()
        return [{
          url: side.imageUrl,
          name: onScreen
            ? `${placement.name} nur im Laptop, nicht als Körper im Raum`
            : `Seitenansicht ${placement.name}`,
          role: 'identity' as const,
        }]
      }),
      ...(pickedCastUrl(faceLibrary, dialog.catalogCast?.placeIds, panelForGen.settingHint)
        ? [{
            url: pickedCastUrl(faceLibrary, dialog.catalogCast?.placeIds, panelForGen.settingHint) as string,
            name: panelForGen.settingHint || 'Raum',
            role: 'grundbild' as const,
          }]
        : []),
    ].slice(0, 3)
    const whoOnWide = (wide ?? panelForGen).placements.find(
      (pl) => pl.name.trim().toLowerCase() === speaker.trim().toLowerCase(),
    )
    const continuityEn = videoCall
      ? videoCallFrameEn({
          host: videoHost,
          others: seatNames.filter((name) => name.trim().toLowerCase() !== videoHost.toLowerCase()),
          shot: panelForGen.shot,
        })
      : continuityEnFor(dialog, panelForGen, wide, speaker, correction)
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
        situationText,
        continuityBriefEn,
        directorRefs,
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
        situationText,
        continuityBriefEn,
        directorRefs,
        targetLanguage,
        beatTotal,
        inventory: dialog.filmInventory,
      })
      next = withAttempt(applyPanelStill(next, panelId, closeUrl, resolvedStyle), closeUrl, false, [
        { url: newWideUrl, useEn: 'new wide picture of the room, the close-up is cut from it' },
      ])
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
    const placeWideUrl = videoCall || isInsert || fresh ? undefined : grund?.stillUrl
    const prevPlaceUrl = videoCall || fresh ? undefined : previousPlaceStillUrl(boardForGen, panelForGen)
    let editLibrary: ReturnType<typeof libraryForCompose> | undefined
    if (correction) {
      try {
        editLibrary = libraryForCompose(await listStoryAssets(userId))
      } catch {
        /* ohne Bibliothek: Orts-Grundbild und Stammbilder */
      }
    }
    const pack = stillReferencePack(panelForGen, {
      previousStillUrl: correction ? undefined : prevPlaceUrl,
      correctFromUrl,
      sceneWideStillUrl: correction ? undefined : placeWideUrl,
      board: boardForGen,
      inventory: dialog.filmInventory,
      library: editLibrary,
      blockedStillUrls: refBlocked.size ? refBlocked : undefined,
    })
    const url = await generateFilmPanelStillImage({
      panel: panelForGen,
      scene,
      styleId: resolvedStyle,
      previousStillUrl: correction ? undefined : prevPlaceUrl,
      correctFromUrl,
      targetLanguage,
      beatTotal,
      sceneWideStillUrl: correction ? undefined : placeWideUrl,
      speakerGender:
        genderFromPictureNote(correction) ??
        speakerGender(dialog, speaker) ??
        genderFromKnownName(speaker),
      speakerX: whoOnWide?.x,
      speakerSitting: sittingFromPlacement(whoOnWide),
      continuityEn: continuityForShot,
      situationText,
      continuityBriefEn,
      directorRefs,
      board: boardForGen,
      inventory: dialog.filmInventory,
      library: editLibrary,
    })
    const sentRefs = [
      ...directorRefs.map((ref) => ({ url: ref.url, useEn: ref.name })),
      ...pack.items.map((item) => ({ url: item.url, useEn: `${item.role}: ${item.name}` })),
    ].filter((ref, index, all) => all.findIndex((other) => other.url === ref.url) === index)
    let withStill = withAttempt(applyPanelStill(boardForGen, panelId, url, resolvedStyle), url, false, sentRefs)
    if (rewrite && !isCloseup && !isInsert && panelForGen.stillUrl) {
      withStill = replaceStillUrl(withStill, panelForGen.stillUrl, url, panelForGen.sceneId)
    }
    const notedBoard = correction ? finishAfterCorrection(withStill, panelForGen) : withStill
    const withNote = applyPanelHarvestNote(
      notedBoard,
      panelId,
      [
        correction ? '' : PAINTED_WITHOUT_PLAN_DE,
        !correction && panelForGen.regiePlanError ? regiePlanErrorLineDe(panelForGen.regiePlanError) : '',
        storyContinuity.situationDe ? `Lage: ${storyContinuity.situationDe}` : '',
        regie?.fixEn ? 'Neu gemalt, weil die Regie einen Fehler gesehen hat.' : '',
        pack.noteDe,
        correction
          ? `Neu gemalt nach Hinweis (alter Weg ohne Plan — bitte noch einmal «Bild ändern»): ${correction}`
          : isCloseup
            ? `Nahaufnahme${speaker ? ` ${speaker}` : ''}: Kamera wechselt den Platz — man schaut der Person ins Gesicht.`
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
    const raw = err instanceof Error ? err.message : 'Standbild fehlgeschlagen.'
    if (correction) console.error('[bild-aendern]', raw)
    const message = correction ? stillEditImageErrorDe(err) : raw
    try {
      const fresh = await getDialog(dialogId, userId, profile)
      const latest = fresh && isFilmStoryboard(fresh.filmStoryboard) ? normalizeFilmStoryboard(fresh.filmStoryboard) : working
      await saveBoard(dialogId, userId, applyPanelStillError(latest, panelId, message), profile)
    } catch {
      /* Speichern des Fehlers ist optional */
    }
    throw new Error(message)
  }
}

/** Ein Schritt der Gesamtschau: höchstens zwei Bilder je Anfrage. */
export async function reviewFilmScene(
  dialogId: string,
  userId: string,
  sceneId: string,
  profile?: UserProfile | null,
  opts?: { fresh?: boolean },
): Promise<{
  dialog: Dialog
  board: FilmStoryboard
  review: import('../shared/film-scene-review.js').FilmSceneReview
  done: boolean
  didDe: string
}> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  const board = normalizeFilmStoryboard(dialog.filmStoryboard)
  const scene = board.scenes.find((item) => item.id === sceneId)
  if (!scene) throw new Error('Szene nicht gefunden.')
  const continuity = board.continuity ?? (await ensureFilmContinuity(dialog, board))
  const library = libraryForCompose(await listStoryAssets(userId).catch(() => []))
  const prev = opts?.fresh ? undefined : scene.sceneReview
  let pending = opts?.fresh ? [] : sceneReviewPending(board, sceneId, prev)
  if (!pending.length) {
    pending = board.panels
      .filter((panel) => panel.sceneId === sceneId && panel.stillUrl?.startsWith('http'))
      .map((panel) => panel.id)
  }
  const batch = pending.slice(0, SCENE_REVIEW_BATCH)
  const rest = pending.slice(SCENE_REVIEW_BATCH)
  const { issues, summaryDe, model } = await reviewSceneBatch({
    dialog,
    board,
    sceneId,
    continuity,
    library,
    picks: dialog.catalogCast,
    panelIds: batch,
  })
  const review = mergeSceneReview(sceneId, prev, issues, rest, summaryDe, model)
  let nextBoard: FilmStoryboard = {
    ...board,
    continuity,
    scenes: board.scenes.map((item) => (item.id === sceneId ? { ...item, sceneReview: review } : item)),
  }
  if (!review.pending?.length) {
    nextBoard = applySceneReviewMarks(nextBoard, sceneId, review)
  }
  const updated = await updateDialog(dialogId, userId, { filmStoryboard: normalizeFilmStoryboard(nextBoard) }, profile)
  if (!updated || !isFilmStoryboard(updated.filmStoryboard)) throw new Error('Die Szene-Prüfung konnte nicht gespeichert werden.')
  const freshBoard = updated.filmStoryboard
  const freshScene = freshBoard.scenes.find((item) => item.id === sceneId)
  const finalReview = freshScene?.sceneReview ?? review
  const done = !finalReview.pending?.length
  const suggest = done ? suggestRefApprovalsFromBoard(freshBoard, sceneId) : []
  const suggestLine =
    suggest.length > 0
      ? `Zum Weitergeben ohne Mitnahme von Fehlern: Bild ${suggest.join(', Bild ')} als Vorlage freigeben.`
      : ''
  const didDe = done
    ? [sceneReviewSummaryDe(finalReview), suggestLine].filter(Boolean).join(' ')
    : `Regie schaut weiter … noch ${finalReview.pending!.length} Bild${finalReview.pending!.length === 1 ? '' : 'er'}.`
  return { dialog: updated, board: freshBoard, review: finalReview, done, didDe }
}

export async function approveFilmSceneRefs(
  dialogId: string,
  userId: string,
  sceneId: string,
  profile?: UserProfile | null,
): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const dialog = await getDialog(dialogId, userId, profile)
  if (!dialog || !isFilmStoryboard(dialog.filmStoryboard)) throw new Error('Kein Storyboard.')
  const board = approveAllSceneRefs(normalizeFilmStoryboard(dialog.filmStoryboard), sceneId)
  const updated = await updateDialog(dialogId, userId, { filmStoryboard: board }, profile)
  if (!updated || !isFilmStoryboard(updated.filmStoryboard)) throw new Error('Freigabe konnte nicht gespeichert werden.')
  return { dialog: updated, board: updated.filmStoryboard }
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
