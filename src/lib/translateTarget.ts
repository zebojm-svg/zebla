import { api } from '../api/client'
import type { Dialog } from '../types'
import { translateTimeoutHintDe, zielspracheBusyLabel } from '../../shared/film-dialog-native'

export { translateTimeoutHintDe, zielspracheBusyLabel }

export type TranslateProgress = {
  dialog: Dialog
  remainingCount: number
  translatedCount: number
  unchanged?: boolean
  message?: string
}

const MAX_ROUNDS = 60

/**
 * Ein Klick: der Server übersetzt nur ein Paket (~8 Zeilen oder einen Abschnitt),
 * speichert, der Client macht die nächsten Runden bis nichts mehr fehlt.
 */
export async function translateTargetUntilDone(opts: {
  dialogId: string
  targetLanguage: string
  includeRomanization?: boolean
  onProgress: (info: TranslateProgress) => void
}): Promise<TranslateProgress> {
  let lastRemaining = Number.POSITIVE_INFINITY
  let last: TranslateProgress | null = null
  for (let round = 0; round < MAX_ROUNDS; round++) {
    console.info('[zebla:zielsprache]', 'round', round, {
      dialogId: opts.dialogId,
      targetLanguage: opts.targetLanguage,
    })
    const result = await api.ai.translate(
      opts.dialogId,
      opts.targetLanguage,
      true,
      opts.includeRomanization,
    )
    const remainingCount = result.remainingCount ?? 0
    const translatedCount = result.translatedCount ?? 0
    last = {
      dialog: result.dialog,
      remainingCount,
      translatedCount,
      unchanged: result.unchanged,
      message: result.message,
    }
    opts.onProgress(last)
    if (result.unchanged || remainingCount <= 0) return last
    if (remainingCount >= lastRemaining) {
      throw new Error(
        'Die Zielsprache kommt nicht weiter. Bitte noch einmal «Zielsprache machen» drücken.',
      )
    }
    lastRemaining = remainingCount
  }
  throw new Error(
    'Die Zielsprache ist noch nicht fertig. Bitte noch einmal «Zielsprache machen» — es macht nur die fehlenden Zeilen.',
  )
}
