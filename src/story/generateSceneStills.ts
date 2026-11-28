import { useState } from 'react'
import { api } from '../api/client'
import type { Dialog } from '../types'
import type { FilmStoryboard, FilmStoryboardPanel } from '../../shared/film-storyboard'
import { panelsNeedingStills, stillTimeoutHintDe } from '../../shared/film-stills'
import {
  stillEditImageErrorDe,
  STILL_EDIT_PAINT_STATUS_DE,
} from '../../shared/film-still-pack'

const REGIE_TRIES = 2

/** Die Regie plant, dann wird gemalt, dann schaut die Regie hin. Passt es nicht, höchstens zweimal neu. Danach bleibt das Bild markiert. */
export async function stillWithRegie(opts: {
  dialogId: string
  panelId: string
  styleId: string
  label: string
  onStatus?: (text: string) => void
  onResult?: (result: { dialog: Dialog; board: FilmStoryboard }) => void
}): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  opts.onStatus?.(`Die Regie plant ${opts.label} …`)
  try {
    const planned = await api.ai.filmPlanPanel(opts.dialogId, opts.panelId)
    opts.onResult?.({ dialog: planned.dialog, board: planned.board })
  } catch {
    /* Ohne Plan malt Zebla wie bisher. */
  }
  opts.onStatus?.(`Jetzt wird ${opts.label} gemalt …`)
  let result = await api.ai.filmStill(opts.dialogId, opts.panelId, opts.styleId)
  opts.onResult?.(result)
  for (let tries = 0; ; tries++) {
    opts.onStatus?.(`Die Regie schaut ${opts.label} an …`)
    let judged: Awaited<ReturnType<typeof api.ai.filmJudge>>
    try {
      judged = await api.ai.filmJudge(opts.dialogId, opts.panelId)
    } catch {
      return result
    }
    result = { dialog: judged.dialog, board: judged.board }
    opts.onResult?.(result)
    if (judged.verdict.ok || tries >= REGIE_TRIES) return result
    opts.onStatus?.(`${opts.label}: ${judged.verdict.noteDe} Neu gemalt (${tries + 1} von ${REGIE_TRIES}) …`)
    result = await api.ai.filmStill(opts.dialogId, opts.panelId, opts.styleId, undefined, {
      fixEn: judged.verdict.fixEn || judged.verdict.noteDe,
      freshRefs: judged.verdict.freshRefs,
    })
    opts.onResult?.(result)
  }
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
}): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  if (opts.prepare !== false) {
    for (let step = 0; step < 24; step++) {
      const prepared = await api.ai.filmPrepare(opts.dialogId, opts.styleId)
      opts.onStatus?.(prepared.didDe)
      opts.onProgress({
        current: 0,
        total: opts.panels.length,
        dialog: prepared.dialog,
        board: prepared.board,
      })
      if (prepared.done) break
    }
  }
  const queue = panelsNeedingStills(opts.panels, opts.styleId, opts.force)
  if (queue.length === 0) {
    throw new Error('Diese Szene hat schon Standbilder. Für neu: «Szene nochmals erzeugen».')
  }

  let last: { dialog: Dialog; board: FilmStoryboard } | null = null
  for (let i = 0; i < queue.length; i++) {
    const panel = queue[i]!
    const result = await stillWithRegie({
      dialogId: opts.dialogId,
      panelId: panel.id,
      styleId: opts.styleId,
      label: `Bild ${i + 1} von ${queue.length}`,
      onStatus: opts.onStatus,
      onResult: (step) => opts.onProgress({ current: i, total: queue.length, ...step }),
    })
    last = result
    opts.onProgress({
      current: i + 1,
      total: queue.length,
      dialog: result.dialog,
      board: result.board,
    })
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
    setProgress({ sceneId, current: 0, total: queue.length })
    try {
      await generateSceneStills({
        dialogId,
        styleId,
        panels,
        force,
        onStatus: (text) => setStatus(text),
        onProgress: ({ current, total, dialog, board }) => {
          apply(dialog, board)
          setProgress({ sceneId, current, total })
        },
      })
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Standbild fehlgeschlagen.'
      setErrors((prev) => ({ ...prev, [sceneId]: stillTimeoutHintDe(raw) }))
    } finally {
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

  return { busySceneId, busyPanelId, status, progress, errors, generate, generateOne }
}
