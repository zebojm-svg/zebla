import { useRef, useState } from 'react'
import { api } from '../api/client'
import type { Dialog } from '../types'
import type { FilmStoryboard, FilmStoryboardPanel } from '../../shared/film-storyboard'
import { panelsNeedingStills, stillTimeoutHintDe } from '../../shared/film-stills'
import {
  stillEditImageErrorDe,
  STILL_EDIT_PAINT_STATUS_DE,
} from '../../shared/film-still-pack'

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
  shouldStop?: () => boolean
}): Promise<StillStep & { stopped?: boolean; painted?: boolean }> {
  const stop = () => Boolean(opts.shouldStop?.())
  opts.onStatus?.(`Die Regie plant ${opts.label} …`)
  let planErrorDe: string | undefined
  let unplannedDe = ''
  let planStep: StillStep | null = null
  try {
    const planned = await api.ai.filmPlanPanel(opts.dialogId, opts.panelId)
    planStep = { dialog: planned.dialog, board: planned.board }
    opts.onResult?.(planStep)
    if (!planned.planned && !planned.reused) unplannedDe = planned.errorDe || 'Grund unbekannt'
  } catch (err) {
    planErrorDe = (err instanceof Error && err.message.trim()) || 'Die Anfrage an die Regie ist fehlgeschlagen'
    unplannedDe = planErrorDe
  }
  if (stop() && planStep) return { ...planStep, stopped: true, painted: false }
  opts.onStatus?.(
    unplannedDe
      ? `${opts.label}: Regie konnte nicht planen (${unplannedDe.replace(/[.\s]+$/, '')}). Gemalt wird ohne Plan …`
      : `Jetzt wird ${opts.label} gemalt …`,
  )
  let result: StillStep = await api.ai.filmStill(opts.dialogId, opts.panelId, opts.styleId, undefined, undefined, planErrorDe)
  opts.onResult?.(result)
  for (let tries = 0; ; tries++) {
    if (stop()) return { ...result, stopped: true, painted: true }
    opts.onStatus?.(`Die Regie schaut ${opts.label} an …`)
    let judged: Awaited<ReturnType<typeof api.ai.filmJudge>>
    try {
      judged = await api.ai.filmJudge(opts.dialogId, opts.panelId)
    } catch {
      return { ...result, painted: true }
    }
    result = { dialog: judged.dialog, board: judged.board }
    opts.onResult?.(result)
    if (judged.verdict.ok || tries >= REGIE_TRIES) return { ...result, painted: true }
    if (stop()) return { ...result, stopped: true, painted: true }
    opts.onStatus?.(`${opts.label}: ${judged.verdict.noteDe} Neu gemalt (${tries + 1} von ${REGIE_TRIES}) …`)
    result = await api.ai.filmStill(
      opts.dialogId,
      opts.panelId,
      opts.styleId,
      undefined,
      { fixEn: judged.verdict.fixEn || judged.verdict.noteDe, freshRefs: judged.verdict.freshRefs },
      planErrorDe,
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

export async function generateSceneStills(opts: {
  dialogId: string
  styleId: string
  panels: FilmStoryboardPanel[]
  force?: boolean
  onProgress: (info: {
    current: number
    total: number
    dialog: Dialog
    board: FilmStoryboard
  }) => void
  onStatus?: (text: string) => void
  prepare?: boolean
  shouldStop?: () => boolean
}): Promise<StillStep & { stoppedNoteDe?: string }> {
  const stop = () => Boolean(opts.shouldStop?.())
  let last: StillStep | null = null
  if (opts.prepare !== false) {
    for (let step = 0; step < 24; step++) {
      const prepared = await api.ai.filmPrepare(opts.dialogId, opts.styleId)
      opts.onStatus?.(prepared.didDe)
      last = { dialog: prepared.dialog, board: prepared.board }
      opts.onProgress({ current: 0, total: opts.panels.length, ...last })
      if (prepared.done) break
      if (stop()) return { ...last, stoppedNoteDe: stoppedNoteDe(null) }
    }
  }
  const queue = panelsNeedingStills(opts.panels, opts.styleId, opts.force)
  if (queue.length === 0) {
    throw new Error('Diese Szene hat schon Standbilder. Für neu: «Szene nochmals erzeugen».')
  }

  let lastNumber: number | null = null
  for (let i = 0; i < queue.length; i++) {
    if (stop() && last) return { ...last, stoppedNoteDe: stoppedNoteDe(lastNumber) }
    const panel = queue[i]!
    const result = await stillWithRegie({
      dialogId: opts.dialogId,
      panelId: panel.id,
      styleId: opts.styleId,
      label: `Bild ${i + 1} von ${queue.length}`,
      onStatus: opts.onStatus,
      onResult: (step) => opts.onProgress({ current: i, total: queue.length, ...step }),
      shouldStop: opts.shouldStop,
    })
    last = result
    if (result.painted !== false) lastNumber = scenePictureNumber(opts.panels, panel.id)
    opts.onProgress({
      current: i + 1,
      total: queue.length,
      dialog: result.dialog,
      board: result.board,
    })
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
  const [progress, setProgress] = useState<{
    sceneId: string
    current: number
    total: number
  } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [stopped, setStopped] = useState<Record<string, string>>({})
  const [stopping, setStopping] = useState(false)
  const stopRef = useRef(false)

  const stop = () => {
    stopRef.current = true
    setStopping(true)
    setStatus('Wird angehalten, sobald der laufende Schritt fertig ist …')
  }

  const generate = async (
    sceneId: string,
    panels: FilmStoryboardPanel[],
    styleId: string,
    force: boolean,
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
    setProgress({ sceneId, current: 0, total: queue.length })
    stopRef.current = false
    setStopping(false)
    try {
      const done = await generateSceneStills({
        dialogId,
        styleId,
        panels,
        force,
        onStatus: (text) => {
          if (!stopRef.current) setStatus(text)
        },
        onProgress: ({ current, total, dialog, board }) => {
          apply(dialog, board)
          setProgress({ sceneId, current, total })
        },
        shouldStop: () => stopRef.current,
      })
      if (done.stoppedNoteDe) setStopped((prev) => ({ ...prev, [sceneId]: done.stoppedNoteDe as string }))
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Standbild fehlgeschlagen.'
      setErrors((prev) => ({ ...prev, [sceneId]: stillTimeoutHintDe(raw) }))
    } finally {
      stopRef.current = false
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
        result = await stillWithRegie({
          dialogId,
          panelId: panel.id,
          styleId,
          label: 'das Bild',
          onStatus: setStatus,
          onResult: (step) => apply(step.dialog, step.board),
        })
      }
      apply(result.dialog, result.board)
      setProgress({ sceneId, current: 1, total: 1 })
    } catch (err) {
      const shown = stillEditImageErrorDe(err)
      setErrors((prev) => ({ ...prev, [sceneId]: shown, [panel.id]: shown }))
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
    stop,
    generate,
    generateOne,
  }
}
