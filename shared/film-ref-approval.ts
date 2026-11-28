/**
 * Gemalte Szenen-Stills dürfen erst als Vorlage für andere Bilder mit,
 * wenn Jean-Marie das freigibt. Raumbilder, Stammbilder und Katalog bleiben frei.
 */

import { normalizeFilmStoryboard, type FilmStoryboard, type FilmStoryboardPanel } from './film-storyboard.js'
import { panelByStillPackNumber, parseStillPackRefs, stillPackNumber } from './film-still-pack.js'
import type { FilmRegiePlanRef } from './film-regie-plan.js'

export const REF_APPROVE_LABEL_DE = 'Als Vorlage freigeben'
export const REF_REVOKE_LABEL_DE = 'Vorlage sperren'

export function refNotApprovedMessageDe(packNumber: number): string {
  return `Bild ${packNumber} ist noch nicht als Vorlage freigegeben. Wähle «${REF_APPROVE_LABEL_DE}» auf diesem Päckchen.`
}

/** Ist diese URL ein gemaltes Still eines Päckchens (nicht Bibliothek allein)? */
export function panelForStillUrl(
  board: FilmStoryboard,
  url: string | undefined,
): FilmStoryboardPanel | undefined {
  const want = url?.trim()
  if (!want?.startsWith('http')) return undefined
  return normalizeFilmStoryboard(board).panels.find((panel) => panel.stillUrl === want)
}

export function isPaintedSceneStillUrl(board: FilmStoryboard | undefined, url: string | undefined): boolean {
  if (!board || !url?.startsWith('http')) return false
  return Boolean(panelForStillUrl(board, url))
}

/** Szenen-Still nur mit Freigabe; Fremdes (Bibliothek, Raumbild, …) immer erlaubt. */
export function stillUrlOkAsRefSource(board: FilmStoryboard | undefined, url: string | undefined): boolean {
  if (!url?.startsWith('http')) return false
  if (!board) return true
  const panels = normalizeFilmStoryboard(board).panels.filter((panel) => panel.stillUrl === url)
  if (!panels.length) return true
  return panels.some((panel) => Boolean(panel.refApprovedByUser))
}

export function filterRefSourceUrl(
  board: FilmStoryboard | undefined,
  url: string | undefined,
): string | undefined {
  if (!url?.startsWith('http')) return undefined
  return stillUrlOkAsRefSource(board, url) ? url : undefined
}

export function panelsNeedingRefApproval(panels: FilmStoryboardPanel[]): FilmStoryboardPanel[] {
  return panels.filter((panel) => panel.stillUrl?.startsWith('http') && !panel.refApprovedByUser)
}

export function applyPanelRefApproval(
  board: FilmStoryboard,
  panelId: string,
  approved: boolean,
): FilmStoryboard {
  const next = normalizeFilmStoryboard(board)
  return {
    ...next,
    panels: next.panels.map((panel) =>
      panel.id === panelId ? { ...panel, refApprovedByUser: approved ? true : undefined } : panel,
    ),
    updatedAt: new Date().toISOString(),
  }
}

/** Alle fertigen Bilder einer Szene freigeben. */
export function approveAllSceneRefs(board: FilmStoryboard, sceneId: string): FilmStoryboard {
  const next = normalizeFilmStoryboard(board)
  return {
    ...next,
    panels: next.panels.map((panel) =>
      panel.sceneId === sceneId && panel.stillUrl?.startsWith('http')
        ? { ...panel, refApprovedByUser: true }
        : panel,
    ),
    updatedAt: new Date().toISOString(),
  }
}

export type StillRefUsageRow = {
  panelId: string
  packNumber: number
  approved: boolean
  usedInPackNumbers: number[]
  caption: string
}

/** Wo spätere Pläne oder Regie-Versuche diese Still-URL als Vorlage hatten. */
export function stillRefUsageInBoard(board: FilmStoryboard, sceneId?: string): StillRefUsageRow[] {
  const all = normalizeFilmStoryboard(board).panels
  const panels = sceneId ? all.filter((panel) => panel.sceneId === sceneId) : all
  const urlOwners = new Map<string, { panelId: string; packNumber: number; approved: boolean; caption: string }>()
  for (const panel of all) {
    const url = panel.stillUrl
    if (!url?.startsWith('http')) continue
    const packNumber = stillPackNumber(board, panel)
    if (!urlOwners.has(url)) {
      urlOwners.set(url, {
        panelId: panel.id,
        packNumber,
        approved: Boolean(panel.refApprovedByUser),
        caption: panel.caption || panel.imageCue || '',
      })
    } else if (panel.refApprovedByUser) {
      const row = urlOwners.get(url)!
      urlOwners.set(url, { ...row, approved: true })
    }
  }
  const usedByUrl = new Map<string, Set<number>>()
  const noteUrl = (url: string | undefined, consumerPack: number) => {
    if (!url?.startsWith('http') || !urlOwners.has(url)) return
    const set = usedByUrl.get(url) ?? new Set<number>()
    set.add(consumerPack)
    usedByUrl.set(url, set)
  }
  for (const panel of all) {
    const consumerPack = stillPackNumber(board, panel)
    for (const ref of panel.regiePlan?.refs ?? []) noteUrl(ref.url, consumerPack)
    for (const attempt of panel.regieAttempts ?? []) {
      for (const ref of attempt.refs ?? []) noteUrl(ref.url, consumerPack)
    }
  }
  return panels
    .filter((panel) => panel.stillUrl?.startsWith('http'))
    .map((panel) => {
      const packNumber = stillPackNumber(board, panel)
      const used = usedByUrl.get(panel.stillUrl!) ?? new Set<number>()
      return {
        panelId: panel.id,
        packNumber,
        approved: Boolean(panel.refApprovedByUser),
        usedInPackNumbers: [...used].filter((n) => n !== packNumber).sort((a, b) => a - b),
        caption: panel.caption || panel.imageCue || '',
      }
    })
    .sort((a, b) => a.packNumber - b.packNumber)
}

/** Gesamtschau: frühere Bilder ohne Freigabe, die später angerufen wurden. */
export function suggestRefApprovalsFromBoard(board: FilmStoryboard, sceneId: string): number[] {
  return stillRefUsageInBoard(board, sceneId)
    .filter((row) => !row.approved && row.usedInPackNumbers.length > 0)
    .map((row) => row.packNumber)
}

export function blockedPackNumbersFromHint(
  board: FilmStoryboard,
  hint: string,
): { blocked: number[]; messages: string[] } {
  const messages: string[] = []
  const blocked: number[] = []
  for (const n of parseStillPackRefs(hint)) {
    const panel = panelByStillPackNumber(board, n)
    const url = panel?.stillUrl
    if (!url?.startsWith('http')) continue
    if (stillUrlOkAsRefSource(board, url)) continue
    blocked.push(n)
    messages.push(refNotApprovedMessageDe(n))
  }
  return { blocked, messages }
}

/** Filtert Regie-Plan-Vorlagen und Katalog-Einträge nach Freigabe. */
export function filterRegiePlanRefs(
  board: FilmStoryboard | undefined,
  refs: FilmRegiePlanRef[],
): FilmRegiePlanRef[] {
  if (!board) return refs
  return refs.filter((ref) => stillUrlOkAsRefSource(board, ref.url))
}