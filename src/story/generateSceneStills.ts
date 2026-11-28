import { useRef, useState } from 'react'
import { api } from '../api/client'
import type { Dialog } from '../types'
import type { FilmStoryboard, FilmStoryboardPanel } from '../../shared/film-storyboard'
import {
  panelsNeedingStills,
  sceneGenerateOverallTimeoutDe,
  SCENE_GENERATE_OVERALL_TIMEOUT_MS,
  stillTimeoutHintDe,
} from '../../shared/film-stills'
import {
  stillEditImageErrorDe,
  STILL_EDIT_PAINT_STATUS_DE,
} from '../../shared/film-still-pack'
import {
  sceneBatchRepaintIds,
  SCENE_REVIEW_AUTO_MAX_MS,
  SCENE_REVIEW_AUTO_MAX_STEPS,
  sceneReviewCheckedCount,
  sceneReviewPanelCount,
  sceneReviewProgressDe,
  sceneRunFinishDe,
  type FilmSceneReview,
  type SceneRunFinishKind,
} from '../../shared/film-scene-review'
import { RefApprovalRequired, type RefApprovalBlock } from '../../shared/film-ref-approval'

const REGIE_TRIES = 2

type StillStep = { dialog: Dialog; board: FilmStoryboard }

/**
 * Die Regie plant, dann wird gemalt, dann schaut die Regie hin. Passt es nicht, höchstens zweimal neu. Danach bleibt das Bild markiert.
 * «Anhalten» bricht keine laufende Anfrage ab: zwischen den Schritten wird nachgeschaut. Das letzte Bild bleibt.
 */
export async function stillWithRegie(opts: {
  dialogId: string
  panelId: string
  styleId: string
  label: string
  onStatus?: (text: string) => void
  onResult?: (result: StillStep) => void
  onRefBlock?: (block: RefApprovalBlock) => void
  shouldStop?: () => boolean
  signal?: AbortSignal
}): Promise<StillStep & { stopped?: boolean; painted?: boolean; refApprovalBlock?: RefApprovalBlock }> {
  const stop = () => Boolean(opts.shouldStop?.())
  opts.onStatus?.(`Die Regie plant ${opts.label} …`)
  let planErrorDe: string | undefined
  let unplannedDe = ''
  let planStep: StillStep | null = null
  try {
    const planned = await api.ai.filmPlanPanel(opts.dialogId, opts.panelId, opts.signal)
    planStep = { dialog: planned.dialog, board: planned.board }
    opts.onResult?.(planStep)
    if (planned.refApprovalBlock) {
      opts.onRefBlock?.(planned.refApprovalBlock)
      return { ...planStep, stopped: true, painted: false, refApprovalBlock: planned.refApprovalBlock }
    }
    if (!planned.planned && !planned.reused) unplannedDe = planned.errorDe || 'Grund unbekannt'
  } catch (err) {
    planErrorDe = (err instanceof Error && err.message.trim()) || 'Die Anfrage an die Regie ist fehlgeschlagen'
    unplannedDe = planErrorDe
  }
  if (stop() && planStep) return { ...planStep, stopped: true, painted: false }
  if (stop()) return { ...planStep!, stopped: true, painted: false }
  opts.onStatus?.(
    unplannedDe
      ? `${opts.label}: Regie konnte nicht planen (${unplannedDe.replace(/[.\s]+$/, '')}). Gemalt wird ohne Plan …`
      : `Jetzt wird ${opts.label} gemalt …`,
  )
  let result: StillStep
  try {
    result = await api.ai.filmStill(
      opts.dialogId,
      opts.panelId,
      opts.styleId,
      undefined,
      undefined,
      planErrorDe,
      opts.signal,
    )
  } catch (err) {
    const block = err instanceof RefApprovalRequired ? err.block : null
    if (block && planStep) {
      opts.onRefBlock?.(block)
      return { ...planStep, stopped: true, painted: false, refApprovalBlock: block }
    }
    throw err
  }
  opts.onResult?.(result)
  let judgeRetried = false
  for (let tries = 0; ; tries++) {
    if (stop()) return { ...result, stopped: true, painted: true }
    opts.onStatus?.(`Die Regie schaut ${opts.label} an …`)
    let judged: Awaited<ReturnType<typeof api.ai.filmJudge>>
    const last = tries >= REGIE_TRIES
    try {
      judged = await api.ai.filmJudge(opts.dialogId, opts.panelId, last, opts.signal)
    } catch {
      opts.onStatus?.(`${opts.label}: Die Regie konnte nicht anschauen. Das Bild bleibt, nicht geprüft.`)
      return { ...result, painted: true }
    }
    result = { dialog: judged.dialog, board: judged.board }
    opts.onResult?.(result)
    if (!judged.verdict.checked) {
      if (!judgeRetried && !stop()) {
        judgeRetried = true
        tries--
        opts.onStatus?.(`${opts.label}: ${judged.verdict.noteDe} Die Regie schaut noch einmal …`)
        continue
      }
      return { ...result, painted: true }
    }
    if (judged.pickedAttempt) {
      opts.onStatus?.(`${opts.label}: Die Regie nimmt Versuch ${judged.pickedAttempt}, er hat am wenigsten Fehler.`)
    }
    if (judged.verdict.ok || last) return { ...result, painted: true }
    if (stop()) return { ...result, stopped: true, painted: true }
    opts.onStatus?.(`${opts.label}: ${judged.verdict.noteDe} Neu gemalt (${tries + 1} von ${REGIE_TRIES}) …`)
    result = await api.ai.filmStill(
      opts.dialogId,
      opts.panelId,
      opts.styleId,
      undefined,
      { fixEn: judged.verdict.fixEn || judged.verdict.noteDe, freshRefs: judged.verdict.freshRefs },
      planErrorDe,
      opts.signal,
    )
    opts.onResult?.(result)
  }
}

/** Nummer des Bildes in seiner Szene (1, 2, 3 …), so wie Jean-Marie sie sieht. */
function scenePictureNumber(panels: FilmStoryboardPanel[], panelId: string): number {
  const ordered = [...panels].sort((a, b) => a.panelIndex - b.panelIndex)
  return ordered.findIndex((item) => item.id === panelId) + 1
}

export function stoppedNoteDe(lastNumber: number | null): string {
  const after = lastNumber ? `Angehalten nach Bild ${lastNumber}.` : 'Angehalten, bevor ein neues Bild fertig war.'
  return `${after} Schreib unter dem Bild, was anders sein soll, und drück «Bild ändern». Danach «Szene weiter erzeugen» (malt nur, was fehlt) oder «Ganze Szene neu erzeugen» (malt alle Bilder neu).`
}

/** So viele Vorbereitungs-Schritte höchstens (Stammbilder, Seitenansichten, Raumbilder und ihre Prüfung). */
const PREPARE_STEPS_MAX = 48

/**
 * Bibliothek zuerst: Stammbilder und Raumbilder, ein Schritt je Anfrage, bis alles steht.
 * Misslingt ein Raumbild, hört es auf und sagt es — ohne Raumbild weiter nur, wenn Jean-Marie das wählt.
 */
export async function prepareReferences(opts: {
  dialogId: string
  styleId?: string
  skipPlates?: boolean
  onStatus?: (text: string) => void
  onStep?: (step: StillStep, prepareDe: string) => void
  shouldStop?: () => boolean
  checkDeadline?: () => void
  signal?: AbortSignal
}): Promise<{
  last: StillStep | null
  plateErrorDe?: string
  portraitErrorDe?: string
  stopped?: boolean
}> {
  let last: StillStep | null = null
  for (let step = 0; step < PREPARE_STEPS_MAX; step++) {
    opts.checkDeadline?.()
    if (opts.shouldStop?.()) return { last, stopped: true }
    const prepared = await api.ai.filmPrepare(opts.dialogId, opts.styleId, opts.skipPlates, opts.signal)
    opts.onStatus?.(prepared.didDe)
    last = { dialog: prepared.dialog, board: prepared.board }
    opts.onStep?.(last, prepared.didDe)
    if (prepared.portraitErrorDe) return { last, portraitErrorDe: prepared.portraitErrorDe }
    if (prepared.plateErrorDe) return { last, plateErrorDe: prepared.plateErrorDe }
    if (prepared.done) return { last }
    if (opts.shouldStop?.()) return { last, stopped: true }
  }
  return { last }
}

export type SceneStillsProgress = {
  current: number
  total: number
  preparing?: boolean
  stepDe?: string
  reviewing?: boolean
  reviewChecked?: number
  reviewTotal?: number
}

export type SceneRunCompletion = {
  text: string
  kind: SceneRunFinishKind
  at: string
}

function appendRunLog(lines: string[], line: string): string[] {
  const next = [...lines, `${new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })} — ${line}`]
  return next.slice(-8)
}

export async function generateSceneStills(opts: {
  dialogId: string
  styleId: string
  panels: FilmStoryboardPanel[]
  force?: boolean
  onProgress: (info: SceneStillsProgress & { dialog: Dialog; board: FilmStoryboard }) => void
  onStatus?: (text: string) => void
  onRefBlock?: (block: RefApprovalBlock) => void
  prepare?: boolean
  skipPlates?: boolean
  shouldStop?: () => boolean
  checkDeadline?: () => void
  signal?: AbortSignal
}): Promise<
  StillStep & {
    stoppedNoteDe?: string
    plateErrorDe?: string
    portraitErrorDe?: string
    refApprovalBlock?: RefApprovalBlock
  }
> {
  const stop = () => Boolean(opts.shouldStop?.())
  const tick = () => {
    opts.checkDeadline?.()
  }
  let last: StillStep | null = null
  if (opts.prepare !== false) {
    const prepared = await prepareReferences({
      dialogId: opts.dialogId,
      styleId: opts.styleId,
      skipPlates: opts.skipPlates,
      onStatus: opts.onStatus,
      onStep: (step, prepareDe) =>
        opts.onProgress({
          current: 0,
          total: opts.panels.length,
          preparing: true,
          stepDe: prepareDe,
          ...step,
        }),
      shouldStop: opts.shouldStop,
      checkDeadline: opts.checkDeadline,
      signal: opts.signal,
    })
    last = prepared.last
    if (prepared.portraitErrorDe && last) return { ...last, portraitErrorDe: prepared.portraitErrorDe }
    if (prepared.plateErrorDe && last) return { ...last, plateErrorDe: prepared.plateErrorDe }
    if (prepared.stopped && last) return { ...last, stoppedNoteDe: stoppedNoteDe(null) }
  }
  const queue = panelsNeedingStills(opts.panels, opts.styleId, opts.force)
  if (queue.length === 0) {
    throw new Error('Diese Szene hat schon Standbilder. Für neu: «Szene nochmals erzeugen».')
  }

  let lastNumber: number | null = null
  for (let i = 0; i < queue.length; i++) {
    tick()
    if (stop() && last) return { ...last, stoppedNoteDe: stoppedNoteDe(lastNumber) }
    const panel = queue[i]!
    const result = await stillWithRegie({
      dialogId: opts.dialogId,
      panelId: panel.id,
      styleId: opts.styleId,
      label: `Bild ${i + 1} von ${queue.length}`,
      onStatus: opts.onStatus,
      onResult: (step) =>
        opts.onProgress({ current: i, total: queue.length, preparing: false, ...step }),
      onRefBlock: opts.onRefBlock,
      shouldStop: opts.shouldStop,
      signal: opts.signal,
    })
    last = result
    if (result.painted !== false) lastNumber = scenePictureNumber(opts.panels, panel.id)
    opts.onProgress({
      current: i + 1,
      total: queue.length,
      preparing: false,
      dialog: result.dialog,
      board: result.board,
    })
    if (result.refApprovalBlock) {
      return { ...result, stoppedNoteDe: result.refApprovalBlock.messageDe }
    }
    if (result.stopped) return { ...result, stoppedNoteDe: stoppedNoteDe(lastNumber) }
  }
  if (!last) throw new Error('Kein Bild erzeugt.')
  return last
}

export function useSceneStills(
  dialogId: string | undefined,
  apply: (dialog: Dialog, board: FilmStoryboard) => void,
) {
  const [busySceneId, setBusySceneId] = useState<string | null>(null)
  const [busyPanelId, setBusyPanelId] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState<
    ({ sceneId: string } & SceneStillsProgress) | null
  >(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [stopped, setStopped] = useState<Record<string, string>>({})
  const [stopping, setStopping] = useState(false)
  const [refHighlightIds, setRefHighlightIds] = useState<string[]>([])
  const [completion, setCompletion] = useState<Record<string, SceneRunCompletion>>({})
  const [runLog, setRunLog] = useState<Record<string, string[]>>({})
  const stopRef = useRef(false)
  const runAbortRef = useRef<AbortController | null>(null)

  const logScene = (sceneId: string, line: string) => {
    setRunLog((prev) => ({ ...prev, [sceneId]: appendRunLog(prev[sceneId] ?? [], line) }))
  }

  const setSceneCompletion = (sceneId: string, text: string, kind: SceneRunFinishKind) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setCompletion((prev) => ({
      ...prev,
      [sceneId]: { text: trimmed, kind, at: new Date().toISOString() },
    }))
    logScene(sceneId, trimmed)
  }

  const applyRefBlock = (sceneId: string, block: RefApprovalBlock) => {
    setRefHighlightIds(block.panelIds)
    setErrors((prev) => ({ ...prev, [sceneId]: block.messageDe }))
    setStopped((prev) => ({ ...prev, [sceneId]: block.messageDe }))
    setSceneCompletion(sceneId, `Abgebrochen: ${block.messageDe}`, 'warn')
  }

  const stop = () => {
    stopRef.current = true
    runAbortRef.current?.abort()
    setStopping(true)
    setStatus('Wird angehalten …')
  }

  const runSceneReview = async (
    sceneId: string,
    panels: FilmStoryboardPanel[],
    fresh = true,
    opts?: { signal?: AbortSignal; auto?: boolean },
  ): Promise<{ review?: FilmSceneReview; finishKind: SceneRunFinishKind; finishDe: string }> => {
    if (!dialogId) {
      return { finishKind: 'error', finishDe: 'Fehler: Keine Geschichte geladen.' }
    }
    const reviewTotal = sceneReviewPanelCount(panels)
    const started = Date.now()
    setErrors((prev) => ({ ...prev, [sceneId]: '' }))
    let lastReview: FilmSceneReview | undefined
    let lastErrorDe = ''
    let incomplete = false

    for (let step = 0; step < SCENE_REVIEW_AUTO_MAX_STEPS; step++) {
      if (stopRef.current) {
        return {
          review: lastReview,
          finishKind: 'warn',
          finishDe: sceneRunFinishDe({
            kind: 'warn',
            review: lastReview,
            reasonDe: 'Abgebrochen. Fertige Bilder bleiben.',
          }),
        }
      }
      if (Date.now() - started > SCENE_REVIEW_AUTO_MAX_MS) {
        incomplete = true
        lastErrorDe = 'Die Szene-Prüfung hat zu lange gedauert. Unten «Szene prüfen» noch einmal.'
        break
      }
      const checkedBefore = sceneReviewCheckedCount(lastReview, reviewTotal)
      const progressDe = sceneReviewProgressDe(checkedBefore, reviewTotal)
      setStatus(progressDe)
      setProgress({
        sceneId,
        current: reviewTotal,
        total: reviewTotal,
        reviewing: true,
        reviewChecked: checkedBefore,
        reviewTotal,
        stepDe: progressDe,
      })
      try {
        const result = await api.ai.filmSceneReview(
          dialogId,
          sceneId,
          step === 0 && fresh,
          opts?.signal,
        )
        apply(result.dialog, result.board)
        lastReview = result.review
        const checked = sceneReviewCheckedCount(result.review, reviewTotal)
        const stepDe = sceneReviewProgressDe(checked, reviewTotal)
        setStatus(stepDe)
        setProgress({
          sceneId,
          current: reviewTotal,
          total: reviewTotal,
          reviewing: true,
          reviewChecked: checked,
          reviewTotal,
          stepDe,
        })
        logScene(sceneId, result.done ? result.didDe : stepDe)
        if (result.done) {
          const kind: SceneRunFinishKind = result.review.ok ? 'success' : 'info'
          return {
            review: result.review,
            finishKind: kind,
            finishDe: sceneRunFinishDe({ kind, review: result.review }),
          }
        }
      } catch (err) {
        lastErrorDe =
          err instanceof Error ? stillTimeoutHintDe(err.message) : 'Szene-Prüfung fehlgeschlagen.'
        logScene(sceneId, lastErrorDe)
        break
      }
    }

    if (incomplete || lastErrorDe) {
      const reason = lastErrorDe || 'Die Szene-Prüfung ist nicht fertig. Unten «Szene prüfen» weitermachen.'
      return {
        review: lastReview,
        finishKind: 'warn',
        finishDe: sceneRunFinishDe({ kind: 'warn', review: lastReview, reasonDe: reason }),
      }
    }
    return {
      review: lastReview,
      finishKind: 'warn',
      finishDe: sceneRunFinishDe({
        kind: 'warn',
        review: lastReview,
        reasonDe: 'Die Szene-Prüfung ist nicht fertig. Unten «Szene prüfen» weitermachen.',
      }),
    }
  }

  const generate = async (
    sceneId: string,
    panels: FilmStoryboardPanel[],
    styleId: string,
    force: boolean,
    skipPlates = false,
  ) => {
    if (!dialogId) return
    if (busySceneId) {
      setErrors((prev) => ({
        ...prev,
        [sceneId]: 'Ein Bild läuft schon. Bitte warten.',
      }))
      return
    }
    const queue = panelsNeedingStills(panels, styleId, force)
    setBusySceneId(sceneId)
    setBusyPanelId(null)
    setStatus('Erzeuge Szene …')
    setErrors((prev) => ({ ...prev, [sceneId]: '' }))
    setStopped((prev) => ({ ...prev, [sceneId]: '' }))
    setRefHighlightIds([])
    setProgress({ sceneId, current: 0, total: queue.length })
    setCompletion((prev) => {
      const next = { ...prev }
      delete next[sceneId]
      return next
    })
    logScene(sceneId, force ? 'Ganze Szene neu erzeugen gestartet.' : 'Szene erzeugen gestartet.')
    stopRef.current = false
    setStopping(false)
    const runAbort = new AbortController()
    runAbortRef.current = runAbort
    const deadline = Date.now() + SCENE_GENERATE_OVERALL_TIMEOUT_MS
    const checkDeadline = () => {
      if (Date.now() > deadline) throw new Error(sceneGenerateOverallTimeoutDe())
    }
    let paintedCount = 0
    try {
      const done = await generateSceneStills({
        dialogId,
        styleId,
        panels,
        force,
        skipPlates,
        onStatus: (text) => {
          if (!stopRef.current) setStatus(text)
        },
        onProgress: ({ current, total, preparing, stepDe, dialog, board }) => {
          apply(dialog, board)
          setProgress({ sceneId, current, total, preparing, stepDe })
          if (!preparing && current > 0) paintedCount = current
        },
        shouldStop: () => stopRef.current,
        checkDeadline,
        signal: runAbort.signal,
        onRefBlock: (block) => applyRefBlock(sceneId, block),
      })
      if (done.refApprovalBlock) {
        applyRefBlock(sceneId, done.refApprovalBlock)
        return
      }
      if (done.portraitErrorDe) {
        const msg = done.portraitErrorDe as string
        setErrors((prev) => ({ ...prev, [sceneId]: msg }))
        setSceneCompletion(sceneId, `Fehler: ${msg}`, 'error')
        return
      }
      if (done.plateErrorDe) {
        const msg = done.plateErrorDe as string
        setErrors((prev) => ({ ...prev, [sceneId]: msg }))
        setSceneCompletion(sceneId, `Fehler: ${msg}`, 'error')
        return
      }
      if (done.stoppedNoteDe) {
        const note = done.stoppedNoteDe as string
        setStopped((prev) => ({ ...prev, [sceneId]: note }))
        setSceneCompletion(sceneId, `Abgebrochen. ${note}`, 'warn')
        return
      }
      paintedCount = queue.length
      const fullRegen = force && queue.length === panels.length
      if (fullRegen) {
        const review = await runSceneReview(sceneId, panels, true, { signal: runAbort.signal, auto: true })
        setSceneCompletion(sceneId, review.finishDe, review.finishKind)
      } else {
        setSceneCompletion(
          sceneId,
          sceneRunFinishDe({ kind: 'success', painted: paintedCount }),
          'success',
        )
      }
    } catch (err) {
      if (err instanceof RefApprovalRequired) {
        applyRefBlock(sceneId, err.block)
      } else {
        const raw = err instanceof Error ? err.message : 'Standbild fehlgeschlagen.'
        if (raw === 'Angehalten.') {
          const note = stoppedNoteDe(null)
          setStopped((prev) => ({ ...prev, [sceneId]: note }))
          setSceneCompletion(sceneId, `Abgebrochen. ${note}`, 'warn')
        } else {
          const shown = stillTimeoutHintDe(raw)
          setErrors((prev) => ({ ...prev, [sceneId]: shown }))
          const prefix = paintedCount > 0 ? `${paintedCount} Bilder fertig. ` : ''
          setSceneCompletion(sceneId, `Fehler: ${prefix}${shown}`, 'error')
        }
      }
    } finally {
      stopRef.current = false
      runAbortRef.current = null
      setStopping(false)
      setBusySceneId(null)
      setBusyPanelId(null)
      setStatus('')
      setProgress(null)
    }
  }

  const generateOne = async (
    sceneId: string,
    panel: FilmStoryboardPanel,
    styleId: string,
    note?: string,
  ) => {
    if (!dialogId) return
    const hint = note?.trim() ?? ''
    if (busySceneId) {
      setErrors((prev) => ({
        ...prev,
        [sceneId]: 'Ein Bild läuft schon. Bitte warten.',
        [panel.id]: 'Ein Bild läuft schon. Bitte warten.',
      }))
      return
    }
    setStopped((prev) => ({ ...prev, [sceneId]: '' }))
    setBusySceneId(sceneId)
    setBusyPanelId(panel.id)
    setStatus(STILL_EDIT_PAINT_STATUS_DE)
    setErrors((prev) => ({ ...prev, [sceneId]: '', [panel.id]: '' }))
    setProgress({ sceneId, current: 0, total: 1 })
    try {
      let result: { dialog: Dialog; board: FilmStoryboard }
      if (!hint) {
        for (let step = 0; step < 24; step++) {
          const prepared = await api.ai.filmPrepare(dialogId, styleId)
          setStatus(prepared.didDe)
          apply(prepared.dialog, prepared.board)
          if (prepared.done) break
        }
      }
      if (hint) {
        result = await api.ai.filmStill(dialogId, panel.id, styleId, hint)
      } else {
        const painted = await stillWithRegie({
          dialogId,
          panelId: panel.id,
          styleId,
          label: 'das Bild',
          onStatus: setStatus,
          onResult: (step) => apply(step.dialog, step.board),
          onRefBlock: (block) => applyRefBlock(sceneId, block),
        })
        if (painted.refApprovalBlock) return
        result = painted
      }
      apply(result.dialog, result.board)
      setProgress({ sceneId, current: 1, total: 1 })
    } catch (err) {
      if (err instanceof RefApprovalRequired) {
        applyRefBlock(sceneId, err.block)
      } else {
        const shown = stillEditImageErrorDe(err)
        setErrors((prev) => ({ ...prev, [sceneId]: shown, [panel.id]: shown }))
      }
    } finally {
      setBusySceneId(null)
      setBusyPanelId(null)
      setStatus('')
      setProgress(null)
    }
  }

  return {
    busySceneId,
    busyPanelId,
    status,
    progress,
    errors,
    stopped,
    stopping,
    refHighlightIds,
    completion,
    runLog,
    clearCompletion: (sceneId: string) => {
      setCompletion((prev) => {
        const next = { ...prev }
        delete next[sceneId]
        return next
      })
    },
    clearRefHighlight: () => setRefHighlightIds([]),
    stop,
    generate,
    generateOne,
    reviewScene: async (sceneId: string, panels: FilmStoryboardPanel[], fresh = true) => {
      if (!dialogId || busySceneId) return
      setBusySceneId(sceneId)
      setCompletion((prev) => {
        const next = { ...prev }
        delete next[sceneId]
        return next
      })
      logScene(sceneId, 'Szene prüfen gestartet.')
      const runAbort = new AbortController()
      runAbortRef.current = runAbort
      try {
        const review = await runSceneReview(sceneId, panels, fresh, { signal: runAbort.signal })
        setSceneCompletion(sceneId, review.finishDe, review.finishKind)
      } catch (err) {
        const shown = err instanceof Error ? stillTimeoutHintDe(err.message) : 'Szene-Prüfung fehlgeschlagen.'
        setErrors((prev) => ({ ...prev, [sceneId]: shown }))
        setSceneCompletion(sceneId, `Fehler: ${shown}`, 'error')
      } finally {
        runAbortRef.current = null
        setBusySceneId(null)
        setStatus('')
        setProgress(null)
      }
    },
    repaintReviewIssues: async (
      sceneId: string,
      panels: FilmStoryboardPanel[],
      styleId: string,
      review: FilmSceneReview | undefined,
    ) => {
      if (!dialogId) return
      let workPanels = panels
      const ids = sceneBatchRepaintIds(workPanels, review)
      if (!ids.length) return
      setBusySceneId(sceneId)
      for (let i = 0; i < ids.length; i++) {
        const panelId = ids[i]!
        const panel = workPanels.find((item) => item.id === panelId)
        if (!panel) continue
        const issue = review?.issues.find((item) => item.panelId === panelId)
        const hint =
          panel.stillCorrection?.trim() ||
          issue?.fixEn?.trim() ||
          issue?.noteDe?.trim() ||
          ''
        setStatus(`Markierte Bilder ändern (${i + 1} von ${ids.length}) …`)
        if (!hint) {
          setErrors((prev) => ({
            ...prev,
            [panelId]: 'Schreib kurz unter dem Bild, was anders sein soll.',
          }))
          continue
        }
        try {
          await generateOne(sceneId, panel, styleId, hint)
          const cleared = await api.ai.filmPack(dialogId, panelId, { stillMarkRedo: false })
          apply(cleared.dialog, cleared.board)
          workPanels = cleared.board.panels.filter((item) => item.sceneId === sceneId)
        } catch (err) {
          setErrors((prev) => ({
            ...prev,
            [panelId]: err instanceof Error ? err.message : 'Neu malen fehlgeschlagen.',
          }))
        }
      }
      setBusySceneId(null)
      setStatus('')
      const done = ids.length
      setSceneCompletion(
        sceneId,
        done
          ? `${done} markierte Bild${done === 1 ? '' : 'er'} bearbeitet — schau die Bilder an.`
          : 'Kein markiertes Bild zum Ändern.',
        done ? 'info' : 'warn',
      )
    },
  }
}
