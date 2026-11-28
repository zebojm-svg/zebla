/**
 * Ganze Szene nebeneinander prüfen: Dialog + kleine Bilder, Regie meldet Fehler je Bild.
 */

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
  return review.issues.filter((item) => !item.ok).map((item) => item.panelId)
}

export function sceneReviewSummaryDe(review: FilmSceneReview | undefined): string {
  if (!review) return ''
  if (review.pending?.length) return `Regie schaut noch ${review.pending.length} Bild${review.pending.length === 1 ? '' : 'er'} an …`
  if (review.ok) return review.summaryDe?.trim() || 'Die Regie hat keine Fehler in dieser Szene gefunden.'
  const bad = review.issues.filter((item) => !item.ok)
  if (bad.length === 1) return `Ein Bild passt nicht: ${bad[0]!.noteDe}`
  return `${bad.length} Bilder passen nicht. Darunter steht, was die Regie meint.`
}