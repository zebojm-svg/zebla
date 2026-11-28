import { regieJsonWithModel } from './ai.js'
import { imagePartFromUrl, type InlinePart } from './film-image-parts.js'
import { regiebuchVorgabenDe, regiebuchFromContinuity, type FilmContinuity } from '../shared/film-continuity.js'
import { regiePlanSummaryDe } from '../shared/film-regie-plan.js'
import { roomPlateRoleDe } from '../shared/film-room-plate.js'
import { roomPlateUrl } from './film-continuity.js'
import type { FilmSceneReview, FilmSceneReviewIssue } from '../shared/film-scene-review.js'
import type { Dialog } from '../shared/types.js'
import type { FilmStoryboard, FilmStoryboardPanel } from '../shared/film-storyboard.js'
import type { StoryLibraryAsset } from '../shared/story-types.js'
import type { CatalogCast } from '../shared/catalog-cast.js'

export const SCENE_REVIEW_THUMB = 384
/** So viele Bilder pro Anfrage, damit unter 180 s auf Vercel bleibt. */
export const SCENE_REVIEW_BATCH = 2

const SYSTEM = `Du bist die Regie einer Bildergeschichte. Du liest den Dialog einer Szene und schaust mehrere fertige Bilder nebeneinander (kleine Vorschaubilder) und die Raumbilder der Orte.
Du suchst Fehler über die ganze Szene: gleiche Person sieht anders aus (Kleidung, Farbe des Oberteils), Ort wechselt die Einrichtung, Schreibtisch und Stuhl springen von Bild zu Bild, Satz passt nicht zum Bild, jemand fehlt oder ist zu oft da, etwas aus einem anderen Ort taucht hier auf.
Vergleiche dieselbe Person über alle Bilder: dieselbe Kleidung und Farbe. Vergleiche feste Möbel am selben Ort (Schreibtisch, Stuhl, Regal) mit dem Raumbild und mit früheren Bildern dort.
Gegenschuss und Nahaufnahme im selben Raum sind erlaubt, wenn die Einrichtung zum Raumbild passt.
Antworte nur mit JSON:
{
  "summaryDe": "ein kurzer deutscher Satz für Jean-Marie",
  "pictures": [
    { "panelId": "die echte Bild-id", "ok": true, "noteDe": "", "fixEn": "" }
  ]
}
ok false nur bei einem echten Fehler. noteDe: ein einfacher deutscher Satz, was nicht stimmt (leer wenn ok). fixEn: konkreter Auftrag an den Maler, nur wenn ok false.`

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function readIssues(raw: unknown, batch: FilmStoryboardPanel[]): FilmSceneReviewIssue[] {
  const row = (Array.isArray(raw) ? raw.find((item) => item && typeof item === 'object') : raw) as
    | Record<string, unknown>
    | undefined
  const list = Array.isArray(row?.pictures) ? row.pictures : []
  const byId = new Map<string, FilmSceneReviewIssue>()
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>
    const panelId = clip(entry.panelId, 80)
    if (!panelId) continue
    const ok = entry.ok === true
    byId.set(panelId, {
      panelId,
      panelIndex: batch.find((panel) => panel.id === panelId)?.panelIndex ?? 0,
      ok,
      noteDe: clip(entry.noteDe, 240) || (ok ? '' : 'Die Regie hat einen Fehler gesehen.'),
      ...(ok ? {} : { fixEn: clip(entry.fixEn, 500) }),
    })
  }
  return batch.map((panel) => {
    const hit = byId.get(panel.id)
    if (hit) return { ...hit, panelIndex: panel.panelIndex }
    return { panelId: panel.id, panelIndex: panel.panelIndex, ok: true, noteDe: '' }
  })
}

export function mergeSceneReview(
  sceneId: string,
  prev: FilmSceneReview | undefined,
  batchIssues: FilmSceneReviewIssue[],
  pending: string[],
  summaryDe?: string,
  model?: string,
): FilmSceneReview {
  const merged = new Map<string, FilmSceneReviewIssue>()
  for (const item of prev?.issues ?? []) merged.set(item.panelId, item)
  for (const item of batchIssues) merged.set(item.panelId, item)
  const issues = [...merged.values()].sort((a, b) => a.panelIndex - b.panelIndex)
  const bad = issues.filter((item) => !item.ok)
  return {
    sceneId,
    pending: pending.length ? pending : undefined,
    issues,
    ok: pending.length === 0 && bad.length === 0,
    ...(summaryDe ? { summaryDe } : prev?.summaryDe ? { summaryDe: prev.summaryDe } : {}),
    ...(model ? { model } : prev?.model ? { model: prev.model } : {}),
    at: new Date().toISOString(),
  }
}

export async function reviewSceneBatch(opts: {
  dialog: Dialog
  board: FilmStoryboard
  sceneId: string
  continuity: FilmContinuity
  library: StoryLibraryAsset[]
  picks?: CatalogCast | null
  panelIds: string[]
  budgetMs?: number
}): Promise<{ issues: FilmSceneReviewIssue[]; summaryDe?: string; model?: string }> {
  const panels = opts.board.panels
    .filter((panel) => panel.sceneId === opts.sceneId && opts.panelIds.includes(panel.id) && panel.stillUrl?.startsWith('http'))
    .sort((a, b) => a.panelIndex - b.panelIndex)
  if (!panels.length) return { issues: [] }
  const regiebuchDe = regiebuchVorgabenDe(regiebuchFromContinuity(opts.continuity))
  const dialogBits: string[] = []
  for (const panel of panels) {
    dialogBits.push(`Bild ${panel.panelIndex + 1} (id ${panel.id}): ${panel.caption}`)
  }
  const images: InlinePart[] = []
  const legend: string[] = []
  for (const panel of panels) {
    const part = await imagePartFromUrl(panel.stillUrl as string, { timeoutMs: 12_000, maxWidth: SCENE_REVIEW_THUMB })
    if (!part) continue
    images.push(part)
    const plan = panel.regiePlan ? regiePlanSummaryDe(panel.regiePlan) : ''
    legend.push(`Bild ${images.length} = Panel ${panel.id}. ${plan || panel.caption}`)
  }
  if (!images.length) return { issues: panels.map((panel) => ({ panelId: panel.id, panelIndex: panel.panelIndex, ok: true, noteDe: '' })) }
  const places = new Set(panels.map((panel) => panel.regiePlan?.place).filter(Boolean) as string[])
  for (const place of places) {
    if (images.length + legend.length > 14) break
    const url = roomPlateUrl(opts.continuity, opts.library, opts.picks, place)
    if (!url) continue
    const part = await imagePartFromUrl(url, { timeoutMs: 10_000, maxWidth: SCENE_REVIEW_THUMB })
    if (!part) continue
    images.push(part)
    legend.push(`Bild ${images.length}: ${roomPlateRoleDe(place)}`)
  }
  const ask = [
    `REGIEBUCH:\n${regiebuchDe}`,
    `DIALOG UND BILDER DIESER SZENE:\n${dialogBits.join('\n')}`,
    legend.length ? `ANGEHÄNGTE BILDER:\n${legend.join('\n')}` : '',
    `Prüfe nur die ${panels.length} Szenenbild${panels.length === 1 ? '' : 'er'} oben (Panel-Ids: ${panels.map((panel) => panel.id).join(', ')}).`,
  ]
    .filter(Boolean)
    .join('\n\n')
  const timeoutMs = Math.min(opts.budgetMs ?? 90_000, 95_000)
  try {
    const { value, model } = await regieJsonWithModel<unknown>(SYSTEM, ask, images.slice(0, 10), {
      temperature: 0.15,
      timeoutMs,
      timeoutMessage: 'Die Szene-Prüfung hat zu lange gedauert',
    })
    const row = (Array.isArray(value) ? value.find((item) => item && typeof item === 'object') : value) as
      | Record<string, unknown>
      | undefined
  return {
      issues: readIssues(row, panels),
      summaryDe: clip(row?.summaryDe, 300),
      model,
    }
  } catch {
    return {
      issues: panels.map((panel) => ({
        panelId: panel.id,
        panelIndex: panel.panelIndex,
        ok: true,
        noteDe: 'Die Regie konnte dieses Bild in der Gesamtschau nicht lesen.',
      })),
    }
  }
}

export function sceneReviewPending(
  board: FilmStoryboard,
  sceneId: string,
  review?: FilmSceneReview,
): string[] {
  const done = new Set((review?.issues ?? []).map((item) => item.panelId))
  const queued = review?.pending ?? []
  const fromBoard = board.panels
    .filter((panel) => panel.sceneId === sceneId && panel.stillUrl?.startsWith('http'))
    .map((panel) => panel.id)
    .filter((id) => !done.has(id))
  return [...new Set([...queued, ...fromBoard])]
}