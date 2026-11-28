/**
 * Ganze Szene nebeneinander prüfen: Dialog + kleine Bilder, Regie meldet Fehler je Bild.
 */

import type { FilmStoryboard, FilmStoryboardPanel } from './film-storyboard.js'

export interface FilmSceneReviewIssue {
  panelId: string
  panelIndex: number
  ok: boolean
  noteDe: string
  fixEn?: string
}

export interface FilmSceneReview {
  sceneId: string
  /** Noch nicht geprüfte Bild-Ids in dieser Runde. */
  pending?: string[]
  issues: FilmSceneReviewIssue[]
  ok: boolean
  summaryDe?: string
  model?: string
  at?: string
}

export function sceneReviewRedoIds(review: FilmSceneReview | undefined): string[] {
  if (!review?.issues?.length) return []
  return review.issues
    .filter((item) => !item.ok)
    .sort((a, b) => a.panelIndex - b.panelIndex)
    .map((item) => item.panelId)
}

/** Jean-Marie hat Bilder zum Nachmalen angehakt (Reihenfolge wie im Board). */
export function sceneMarkedPanelIds(panels: FilmStoryboardPanel[]): string[] {
  return panels
    .filter((panel) => panel.stillMarkRedo && panel.stillUrl?.startsWith('http'))
    .sort((a, b) => a.panelIndex - b.panelIndex)
    .map((panel) => panel.id)
}

/** Nach «Szene prüfen»: betroffene Bilder ankreuzen und Regie-Hinweis ins Feld legen. */
export function applySceneReviewMarks(
  board: FilmStoryboard,
  sceneId: string,
  review: FilmSceneReview,
): FilmStoryboard {
  if (review.pending?.length) return board
  const badIds = new Set(sceneReviewRedoIds(review))
  if (!badIds.size) return board
  return {
    ...board,
    updatedAt: new Date().toISOString(),
    panels: board.panels.map((panel) => {
      if (panel.sceneId !== sceneId || !badIds.has(panel.id)) return panel
      const issue = review.issues.find((item) => item.panelId === panel.id)
      const regieHint = issue?.fixEn?.trim() || issue?.noteDe?.trim() || ''
      const stillCorrection = panel.stillCorrection?.trim() || regieHint
      return {
        ...panel,
        stillMarkRedo: true,
        ...(stillCorrection ? { stillCorrection } : {}),
      }
    }),
  }
}

export function sceneBatchRepaintIds(
  panels: FilmStoryboardPanel[],
  review: FilmSceneReview | undefined,
): string[] {
  const marked = sceneMarkedPanelIds(panels)
  if (marked.length) return marked
  return sceneReviewRedoIds(review)
}

export function sceneReviewSummaryDe(review: FilmSceneReview | undefined): string {
  if (!review) return ''
  if (review.pending?.length) return `Regie schaut noch ${review.pending.length} Bild${review.pending.length === 1 ? '' : 'er'} an …`
  if (review.ok) return review.summaryDe?.trim() || 'Die Regie hat keine Fehler in dieser Szene gefunden.'
  const bad = review.issues.filter((item) => !item.ok)
  if (bad.length === 1) return `Ein Bild passt nicht: ${bad[0]!.noteDe}`
  return `${bad.length} Bilder passen nicht. Darunter steht, was die Regie meint.`
}

/** Wie viele fertige Bilder gehen in die Gesamtschau. */
export function sceneReviewPanelCount(panels: FilmStoryboardPanel[]): number {
  return panels.filter((panel) => panel.stillUrl?.startsWith('http')).length
}

/** So viele Schritte × zwei Bilder — danach hört die automatische Prüfung auf. */
export const SCENE_REVIEW_AUTO_MAX_STEPS = 24

/** Nach kompletter Neuerzeugung: automatische Prüfung höchstens so lange. */
export const SCENE_REVIEW_AUTO_MAX_MS = 12 * 60 * 1000

export function sceneReviewProgressDe(checked: number, total: number): string {
  if (total <= 0) return 'Szene prüfen …'
  return `Szene prüfen ${Math.min(Math.max(checked, 0), total)} von ${total}`
}

export function sceneReviewCheckedCount(review: FilmSceneReview | undefined, total: number): number {
  if (total <= 0) return 0
  const pending = review?.pending?.length ?? 0
  return Math.max(0, total - pending)
}

export type SceneRunFinishKind = 'success' | 'info' | 'warn' | 'error'

/** Abschluss-Satz für Jean-Marie nach Szene erzeugen / prüfen. */
export function sceneRunFinishDe(opts: {
  kind: SceneRunFinishKind
  painted?: number
  review?: FilmSceneReview
  reasonDe?: string
  reviewSkippedDe?: string
}): string {
  const reason = opts.reasonDe?.trim()
  if (opts.kind === 'error' && reason) return `Fehler: ${reason}`
  if (opts.kind === 'warn' && reason) return reason
  const painted =
    typeof opts.painted === 'number' && opts.painted > 0
      ? `${opts.painted} Bild${opts.painted === 1 ? '' : 'er'} gemalt. `
      : ''
  const reviewLine = opts.review ? sceneReviewSummaryDe(opts.review) : ''
  const skip = opts.reviewSkippedDe?.trim()
  if (opts.kind === 'success') {
    return [painted + 'Fertig.', reviewLine || skip].filter(Boolean).join(' ').trim()
  }
  if (reason) return `${painted}${reason}`
  if (reviewLine) return `${painted}${reviewLine}`
  return painted ? `${painted}Fertig.` : 'Fertig.'
}