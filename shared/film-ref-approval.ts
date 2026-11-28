/**
 * Gemalte Szenen-Stills dürfen erst als Vorlage für andere Bilder mit,
 * wenn Jean-Marie das freigibt. Raumbilder, Stammbilder und Katalog bleiben frei.
 */

import { directorStillUrls, type FilmContinuity } from './film-continuity.js'
import { panelByStillPackNumber, parseStillPackRefs, stillPackNumber } from './film-still-pack.js'
import type { FilmRegiePlanRef } from './film-regie-plan.js'
import {
  normalizeFilmStoryboard,
  panelWantsOwnStill,
  type FilmStoryboard,
  type FilmStoryboardPanel,
} from './film-storyboard.js'
import {
  panelPlaceKey,
  panelPropIds,
  placeGrundbildPanel,
  previousStillUrlInScene,
  sceneGrundbildPanel,
} from './film-stills.js'

export const REF_SCENE_RESUME_DE =
  'Öffne das markierte Bild, wähle «Als Vorlage freigeben», dann «Szene weiter erzeugen».'

export type RefApprovalBlock = {
  /** Das Bild, das gerade hätte gemalt werden sollen. */
  targetPanelId: string
  /** Päckchen, die freigegeben werden müssen (zum Markieren). */
  panelIds: string[]
  packNumbers: number[]
  messageDe: string
}

export class RefApprovalRequired extends Error {
  readonly block: RefApprovalBlock
  constructor(block: RefApprovalBlock) {
    super(block.messageDe)
    this.name = 'RefApprovalRequired'
    this.block = block
  }
}

export function refApprovalBlockFromError(err: unknown): RefApprovalBlock | null {
  if (err instanceof RefApprovalRequired) return err.block
  const maybe = err as { block?: RefApprovalBlock; refApprovalBlock?: RefApprovalBlock }
  if (maybe.block?.messageDe) return maybe.block
  if (maybe.refApprovalBlock?.messageDe) return maybe.refApprovalBlock
  return null
}

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

function noteBlockedUrl(
  blocked: Map<string, number>,
  board: FilmStoryboard,
  url: string | undefined,
) {
  if (!url?.startsWith('http') || stillUrlOkAsRefSource(board, url)) return
  const owner = panelForStillUrl(board, url)
  if (!owner) return
  blocked.set(owner.id, stillPackNumber(board, owner))
}

function previousPlaceStillUrlRaw(board: FilmStoryboard, panel: FilmStoryboardPanel): string | undefined {
  const key = panelPlaceKey(panel)
  const all = normalizeFilmStoryboard(board).panels
  const idx = all.findIndex((item) => item.id === panel.id)
  const search = idx >= 0 ? all.slice(0, idx) : all.filter((item) => item.id !== panel.id)
  for (let i = search.length - 1; i >= 0; i--) {
    const prev = search[i]
    if (!prev?.stillUrl?.startsWith('http')) continue
    if (panelPlaceKey(prev) === key) return prev.stillUrl
  }
  return undefined
}

function previousPropStillUrlRaw(
  board: FilmStoryboard,
  panel: FilmStoryboardPanel,
  propId: string,
): string | undefined {
  const want = propId.trim().toLowerCase()
  if (!want) return undefined
  const all = normalizeFilmStoryboard(board).panels
  const idx = all.findIndex((item) => item.id === panel.id)
  const search = idx >= 0 ? all.slice(0, idx) : all.filter((item) => item.id !== panel.id)
  for (let i = search.length - 1; i >= 0; i--) {
    const prev = search[i]
    if (!prev?.stillUrl?.startsWith('http')) continue
    if (panelPropIds(prev).some((id) => id === want)) return prev.stillUrl
  }
  return undefined
}

/**
 * Braucht dieses Bild beim Malen ein früheres Szenen-Still als Vorlage, das noch nicht freigegeben ist?
 * Dann darf die Generierung nicht weiterlaufen — Jean-Marie gibt zuerst frei.
 */
export function generationBlockedByRefApproval(
  board: FilmStoryboard,
  panelId: string,
  opts?: { continuity?: FilmContinuity; hint?: string },
): RefApprovalBlock | null {
  const normalized = normalizeFilmStoryboard(board)
  const index = normalized.panels.findIndex((item) => item.id === panelId)
  if (index < 0) return null
  const panel = normalized.panels[index]!
  const scenePanels = normalized.panels.filter((item) => item.sceneId === panel.sceneId)
  const hint = opts?.hint?.trim()
  if (!hint && !panelWantsOwnStill(panel, scenePanels) && previousStillUrlInScene(normalized, panel)) {
    return null
  }

  const blocked = new Map<string, number>()
  if (hint) {
    for (const n of blockedPackNumbersFromHint(normalized, hint).blocked) {
      const owner = panelByStillPackNumber(normalized, n)
      if (owner) blocked.set(owner.id, n)
    }
  }

  noteBlockedUrl(blocked, normalized, previousPlaceStillUrlRaw(normalized, panel))
  noteBlockedUrl(blocked, normalized, placeGrundbildPanel(normalized, panel)?.stillUrl)
  if ((panel.shot ?? 'wide') === 'closeup') {
    noteBlockedUrl(blocked, normalized, sceneGrundbildPanel(normalized, panel.sceneId)?.stillUrl)
  }
  for (const propId of panelPropIds(panel)) {
    noteBlockedUrl(blocked, normalized, previousPropStillUrlRaw(normalized, panel, propId))
  }
  if (opts?.continuity) {
    for (const item of directorStillUrls(normalized.panels, opts.continuity, panelId, () => true)) {
      noteBlockedUrl(blocked, normalized, item.url)
    }
  }

  if (!blocked.size) return null
  const packNumbers = [...new Set(blocked.values())].sort((a, b) => a - b)
  const panelIds = [...blocked.keys()]
  const targetPack = stillPackNumber(normalized, panel)
  const refsLabel = packNumbers.map((n) => `Bild ${n}`).join(' und ')
  const messageDe =
    packNumbers.length === 1
      ? `Stopp: Bild ${targetPack} braucht ${refsLabel} als Vorlage. ${refNotApprovedMessageDe(packNumbers[0]!)} ${REF_SCENE_RESUME_DE}`
      : `Stopp: Bild ${targetPack} braucht ${refsLabel} als Vorlage. Diese sind noch nicht freigegeben. ${REF_SCENE_RESUME_DE}`

  return { targetPanelId: panelId, panelIds, packNumbers, messageDe }
}

export function assertRefApprovalForGeneration(
  board: FilmStoryboard,
  panelId: string,
  opts?: { continuity?: FilmContinuity; hint?: string },
): void {
  const block = generationBlockedByRefApproval(board, panelId, opts)
  if (block) throw new RefApprovalRequired(block)
}