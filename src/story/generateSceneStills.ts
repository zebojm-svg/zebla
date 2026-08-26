import { useState } from 'react'
import { api } from '../api/client'
import type { Dialog } from '../types'
import type { FilmStoryboard, FilmStoryboardPanel } from '../../shared/film-storyboard'
import { panelsNeedingStills, stillTimeoutHintDe } from '../../shared/film-stills'

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
}): Promise<{ dialog: Dialog; board: FilmStoryboard }> {
  const queue = panelsNeedingStills(opts.panels, opts.styleId, opts.force)
  if (queue.length === 0) {
    throw new Error('Diese Szene hat schon Standbilder. Für neu: «Szene nochmals erzeugen».')
  }

  let last: { dialog: Dialog; board: FilmStoryboard } | null = null
  for (let i = 0; i < queue.length; i++) {
    const panel = queue[i]!
    const result = await api.ai.filmStill(opts.dialogId, panel.id, opts.styleId)
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
    if (!dialogId || busySceneId) return
    const queue = panelsNeedingStills(panels, styleId, force)
    setBusySceneId(sceneId)
    setBusyPanelId(null)
    setErrors((prev) => ({ ...prev, [sceneId]: '' }))
    setProgress({ sceneId, current: 0, total: queue.length })
    try {
      await generateSceneStills({
        dialogId,
        styleId,
        panels,
        force,
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
      setProgress(null)
    }
  }

  const generateOne = async (
    sceneId: string,
    panel: FilmStoryboardPanel,
    styleId: string,
    note?: string,
  ) => {
    if (!dialogId || busySceneId) return
    setBusySceneId(sceneId)
    setBusyPanelId(panel.id)
    setErrors((prev) => ({ ...prev, [sceneId]: '' }))
    setProgress({ sceneId, current: 0, total: 1 })
    try {
      const result = await api.ai.filmStill(dialogId, panel.id, styleId, note)
      apply(result.dialog, result.board)
      setProgress({ sceneId, current: 1, total: 1 })
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Standbild fehlgeschlagen.'
      setErrors((prev) => ({ ...prev, [sceneId]: stillTimeoutHintDe(raw) }))
    } finally {
      setBusySceneId(null)
      setBusyPanelId(null)
      setProgress(null)
    }
  }

  return { busySceneId, busyPanelId, progress, errors, generate, generateOne }
}
