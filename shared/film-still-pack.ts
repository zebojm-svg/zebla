/**
 * Bild ändern = Förderband, kein Mitdenken.
 * Zebla legt den Katalog hin, reicht den Hinweis weiter,
 * und schickt nur die Bild-ids aus dem Packzettel der Drehbuch-KI.
 */

import {
  panelPropIds,
  panelsForScene,
  panelPlaceKey,
  placeGrundbildPanel,
  previousPropStillUrl,
} from './film-stills.js'
import { placeLabelDe, type FilmPlaceKey } from './film-place.js'
import { propLabelDe, slugPropId, uniqueStable } from './film-inventory.js'
import {
  normalizeFilmStoryboard,
  panelDialogueLines,
  type FilmStoryboard,
  type FilmStoryboardPanel,
} from './film-storyboard.js'
import type { Dialog, FilmInventory } from './types.js'

export type StillCatalogKind = 'current' | 'still' | 'person' | 'place' | 'prop'

export type StillCatalogItem = {
  id: string
  label: string
  url: string
  kind: StillCatalogKind
}

export type StillEditPackzettel = {
  imagePrompt: string
  imageIds: string[]
}

/** Catalog text for the Drehbuch-KI — ids and labels, never image bytes. */
export type StillEditPlannerCatalogItem = {
  id: string
  label: string
  kind?: StillCatalogKind
}

export type StillEditPlannerInput = {
  stillNumber: number
  panelId: string
  userHint: string
  dialogDe: string
  figures: string[]
  place: string
  catalog: StillEditPlannerCatalogItem[]
  styleLabel?: string
}

/** Höchstens so viele Fotos an die Bild-KI — Kapazität, keine Interpretation. */
export const STILL_EDIT_PACK_MAX = 4

export const STILL_EDIT_PLANNER_ERROR_DE =
  'Die Drehbuch-KI hat den Packzettel nicht geliefert. Bitte noch einmal «Bild ändern».'

export const STILL_EDIT_PLANNER_TIMEOUT_DE =
  'Die Drehbuch-KI hat den Packzettel nicht geliefert (Zeitlimit). Bitte noch einmal «Bild ändern».'

export const STILL_EDIT_PLANNER_EMPTY_DE =
  'Die Drehbuch-KI hat den Packzettel nicht geliefert (leere Antwort). Bitte noch einmal «Bild ändern».'

export const STILL_EDIT_PLANNER_INVALID_DE =
  'Die Drehbuch-KI hat den Packzettel nicht geliefert (ungültiger Packzettel). Bitte noch einmal «Bild ändern».'

/** Unclassified Google/SDK dump — never show the sentence without a reason. */
export const STILL_EDIT_PLANNER_GOOGLE_DE =
  'Die Drehbuch-KI hat den Packzettel nicht geliefert (Google-Fehler). Bitte noch einmal «Bild ändern».'

/** Google HTTP status in the German sentence — no English payload, no quota URL. */
export function stillEditPlannerStatusDe(status: number): string {
  return `Die Drehbuch-KI hat den Packzettel nicht geliefert (${status}). Bitte noch einmal «Bild ändern».`
}

/** Same shape as Probe — no English quota URL. */
export const STILL_EDIT_PLANNER_QUOTA_DE =
  'Google ist gerade voll. In einer Minute nochmal «Bild ändern».'

/** Status under the button while this click waits out a 429. */
export const STILL_EDIT_PLANNER_WAIT_DE = 'Google voll, warte kurz …'
export const STILL_EDIT_PLANNER_WAIT_AFTER_MS = 8_000

/**
 * Cheap text Flash for the Packzettel — not TTS, not image.
 * Own per-base-model RPM vs gemini-2.5-flash, gemini-2.5-flash-tts, *-flash-image.
 */
export const STILL_EDIT_PLANNER_MODEL = 'gemini-2.5-flash-lite'

/** Same text Flash as the rest of Zebla — if lite is empty/invalid/404/500. */
export const STILL_EDIT_PLANNER_FALLBACK_MODEL = 'gemini-2.5-flash'

/** Text-JSON only — keep well under a 60 s HTTP budget (quota wait is in this same call). */
export const STILL_EDIT_PLANNER_TIMEOUT_MS = 30_000
export const STILL_EDIT_PLANNER_RETRY_TIMEOUT_MS = 12_000
export const STILL_EDIT_PLANNER_QUOTA_BACKOFF_MS = 16_000
export const STILL_EDIT_PLANNER_QUOTA_RETRIES = 2
export const STILL_EDIT_PLANNER_HTTP_BUDGET_MS = 55_000
export const STILL_EDIT_PLAN_CLIENT_TIMEOUT_MS = STILL_EDIT_PLANNER_HTTP_BUDGET_MS + 3_000

function httpUrl(u?: string): u is string {
  return Boolean(u && u.startsWith('http'))
}

function shortCue(panel: FilmStoryboardPanel): string {
  return (panel.imageCue || panel.caption || panel.settingHint || '').trim() || 'ohne Beschreibung'
}

function placeShelfLabel(key: FilmPlaceKey): string {
  if (key === 'kitchen') return 'Küche/Herd'
  return placeLabelDe(key)
}

export function stillNumberInScene(
  board: FilmStoryboard,
  panel: Pick<FilmStoryboardPanel, 'id' | 'sceneId' | 'panelIndex'>,
): number {
  const same = panelsForScene(board, panel.sceneId)
  const idx = same.findIndex((p) => p.id === panel.id)
  if (idx >= 0) return idx + 1
  return Math.max(1, panel.panelIndex || 1)
}

export function stillEditLineDe(
  panel: FilmStoryboardPanel,
  dialog?: Dialog | null,
): string {
  const lines = panelDialogueLines(panel, dialog)
  const line = lines[0]
  if (line?.nativeDe?.trim()) {
    return `${line.speaker}: ${line.nativeDe.trim()}`
  }
  if (line?.text?.trim()) {
    return `${line.speaker}: ${line.text.trim()}`
  }
  return (panel.caption || panel.imageCue || '').trim() || '—'
}

export function stillEditFigures(
  board: FilmStoryboard,
  panel: FilmStoryboardPanel,
  inventory?: FilmInventory | null,
): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  const add = (raw?: string) => {
    const name = (raw || '').trim()
    if (!name) return
    const key = name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    names.push(name)
  }
  for (const pl of panel.placements) add(pl.name)
  for (const other of panelsForScene(board, panel.sceneId)) {
    for (const pl of other.placements) add(pl.name)
  }
  for (const person of inventory?.people ?? []) add(person.name)
  return names
}

/** Anderes gemaltes Bild mit dieser Sache — nicht das aktuelle Still. */
export function otherPropStillUrl(
  board: FilmStoryboard,
  panel: FilmStoryboardPanel,
  propId: string,
): string | undefined {
  const want = slugPropId(propId)
  if (!want) return undefined
  const all = normalizeFilmStoryboard(board).panels
  for (const other of all) {
    if (other.id === panel.id) continue
    if (!httpUrl(other.stillUrl)) continue
    if (other.stillUrl === panel.stillUrl) continue
    if (panelPropIds(other).some((id) => slugPropId(id) === want)) return other.stillUrl
  }
  return undefined
}

/**
 * Ehrlicher Katalog: jedes Foto mit id + kurzem Label.
 * Zebla wählt nichts aus — die Drehbuch-KI pickt ids.
 */
export function stillEditCatalog(opts: {
  board: FilmStoryboard
  panel: FilmStoryboardPanel
  inventory?: FilmInventory | null
}): StillCatalogItem[] {
  const { board, panel, inventory } = opts
  const scene = panelsForScene(board, panel.sceneId)
  const items: StillCatalogItem[] = []
  const usedIds = new Set<string>()
  const add = (item: StillCatalogItem, allowSameUrl = false) => {
    if (!httpUrl(item.url)) return
    if (usedIds.has(item.id)) return
    if (!allowSameUrl && items.some((x) => x.url === item.url)) return
    usedIds.add(item.id)
    items.push(item)
  }

  const n = stillNumberInScene(board, panel)
  const place = panelPlaceKey(panel)
  const currentUrl = panel.stillUrl
  if (httpUrl(currentUrl)) {
    add(
      {
        id: `current-${panel.id}`,
        label: `aktuelles Still — Bild ${n} (${placeShelfLabel(place)}): ${shortCue(panel)}`,
        url: currentUrl,
        kind: 'current',
      },
      true,
    )
  }

  scene.forEach((other, i) => {
    if (other.id === panel.id) return
    if (!httpUrl(other.stillUrl)) return
    add({
      id: `still-${other.id}`,
      label: `anderes Still der Szene — Bild ${i + 1} (${placeShelfLabel(panelPlaceKey(other))}): ${shortCue(other)}`,
      url: other.stillUrl,
      kind: 'still',
    })
  })

  const grund = placeGrundbildPanel(board, panel)
  if (grund && httpUrl(grund.stillUrl) && grund.id !== panel.id) {
    add({
      id: `place-${place}`,
      label: `${placeShelfLabel(place)} Grundbild`,
      url: grund.stillUrl,
      kind: 'place',
    })
  }

  const bg =
    panel.background.imageUrl && panel.background.match !== 'missing'
      ? panel.background.imageUrl
      : undefined
  if (httpUrl(bg)) {
    add({
      id: `place-lib-${place}`,
      label: `${placeShelfLabel(place)} Bibliothek`,
      url: bg,
      kind: 'place',
    })
  }

  const people = new Map<string, { name: string; url: string }>()
  for (const source of [panel, ...scene]) {
    for (const pl of source.placements) {
      const name = pl.name.trim()
      if (!name || !httpUrl(pl.imageUrl)) continue
      const key = name.toLowerCase()
      if (!people.has(key)) people.set(key, { name, url: pl.imageUrl })
    }
  }
  for (const { name, url } of people.values()) {
    add({
      id: `person-${slugPropId(name)}`,
      label: `${name} Gesicht/Kleidung`,
      url,
      kind: 'person',
    })
  }

  const propIds = uniqueStable([
    ...panelPropIds(panel),
    ...scene.flatMap((p) => panelPropIds(p)),
    ...(inventory?.props ?? []).map((p) => p.id),
  ])
  for (const propId of propIds) {
    const url = otherPropStillUrl(board, panel, propId) || previousPropStillUrl(board, panel, propId)
    if (!httpUrl(url) || url === currentUrl) continue
    add(
      {
        id: `prop-${slugPropId(propId)}`,
        label: `${propLabelDe(propId, inventory)} (Inventar)`,
        url,
        kind: 'prop',
      },
      true,
    )
  }

  return items
}

export function stillEditPlannerSystem(): string {
  return `Du bist die Drehbuch-KI. Du malst NICHT. Nur kurzes JSON.
Der User schreibt einen Hinweis. Zebla versteht den Hinweis nicht — du schon.
Du bekommst den Hinweis, den deutschen Dialog, die Figuren, den Ort und einen Katalog vorhandener Bilder (id + Label).
Antworte genau:
{ "imagePrompt": "englischer Prompt für die Bild-KI", "imageIds": ["id", "..."] }

Regeln:
- Nur ids aus dem Katalog. Unbekannte ids lässt Zebla weg.
- Höchstens ${STILL_EDIT_PACK_MAX} ids.
- Neue Stellung / neues Bild (andere Leute, anderer Platz im Raum, allein, Gäste weg, steht am Herd statt sitzt): das aktuelle Still NICHT listen — Gemini kopiert sonst die Gäste.
- Mini-Retusche (fröhlicher, Mund, Prospekt fehlt): das aktuelle Still listen.
- Gesicht/Kleidung, Küche/Herd, Kanne nur listen, wenn sie für die Änderung helfen.
- imagePrompt sagt der Bild-KI was zu sehen ist. Zebla hängt keine Extra-Sperre «keep these EXACT people / same seats» an.`
}

const PLANNER_LABEL_MAX = 180

function plannerCatalogLabel(label: string): string {
  return label
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/data:[^;\s]+;base64,[A-Za-z0-9+/=]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PLANNER_LABEL_MAX)
}

/** Planner gets id + label (+ kind). URLs and PNG bytes stay off this call. */
export function catalogForPlanner(
  catalog: Array<{ id: string; label: string; kind?: StillCatalogKind; url?: string }>,
): StillEditPlannerCatalogItem[] {
  return catalog.map((it) => ({
    id: it.id,
    label: plannerCatalogLabel(it.label),
    ...(it.kind ? { kind: it.kind } : {}),
  }))
}

export function stillEditPlannerCatalogLines(catalog: StillEditPlannerCatalogItem[]): string {
  const items = catalogForPlanner(catalog)
  if (items.length === 0) return '(leer)'
  return items
    .map((it) => {
      const cue = it.kind ? ` art=${it.kind}` : ''
      return `- id=${it.id}${cue} label=${it.label}`
    })
    .join('\n')
}

export function stillEditPlannerUser(input: StillEditPlannerInput): string {
  const catalogLines = stillEditPlannerCatalogLines(input.catalog)
  const figures = input.figures.filter(Boolean).join(', ') || '—'
  return [
    `Der User möchte Bild Nummer ${input.stillNumber} (id ${input.panelId}) verändern wie folgt: ${input.userHint}`,
    '',
    `Deutscher Dialog dieser Zeile: ${input.dialogDe}`,
    `Figuren: ${figures}`,
    `Ort: ${input.place || '—'}`,
    input.styleLabel ? `Stil: ${input.styleLabel}` : '',
    '',
    'Katalog der vorhandenen Bilder (nur id und Label, keine Fotos):',
    catalogLines,
    '',
    'Erstelle einen Prompt für die Bild-KI und sag welche Bild-ids ich mitschicken muss, damit das gut kommt.',
    'Beispiel nur als Prinzip, nicht kopieren: Hinweis «Ramo allein am Herd» → imageIds ohne aktuelles Tisch-Still, mit Ramo-Gesicht + Küche/Herd + Kanne; imagePrompt malt neu (restage, nicht retouch).',
  ]
    .filter((line) => line !== '')
    .join('\n')
}

/** Second ask when the KI wrote a prompt but listed no catalog ids. */
export function stillEditPlannerRetryUser(input: StillEditPlannerInput): string {
  const ids = catalogForPlanner(input.catalog)
    .map((it) => it.id)
    .filter(Boolean)
  return [
    'Noch einmal, kürzer. Nur JSON, keine Erklärung:',
    '{ "imagePrompt": "englischer Prompt", "imageIds": ["id"] }',
    `Hinweis: ${input.userHint}`,
    `Bild Nummer ${input.stillNumber} (id ${input.panelId})`,
    `ids aus dem Katalog (mindestens eine): ${ids.join(', ') || '—'}`,
    'imageIds nicht leer. Nur ids aus dieser Liste.',
  ].join('\n')
}

export function stillEditPlannerMessages(input: StillEditPlannerInput): {
  system: string
  user: string
} {
  return { system: stillEditPlannerSystem(), user: stillEditPlannerUser(input) }
}

function sliceFirstJsonValue(text: string): string | null {
  const startBrace = text.indexOf('{')
  const startBracket = text.indexOf('[')
  let start = -1
  if (startBrace >= 0 && (startBracket < 0 || startBrace < startBracket)) start = startBrace
  else if (startBracket >= 0) start = startBracket
  if (start < 0) return null

  const stack: string[] = []
  let inStr = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]!
    if (inStr) {
      if (escape) {
        escape = false
        continue
      }
      if (c === '\\') {
        escape = true
        continue
      }
      if (c === '"') inStr = false
      continue
    }
    if (c === '"') {
      inStr = true
      continue
    }
    if (c === '{') stack.push('}')
    else if (c === '[') stack.push(']')
    else if (c === '}' || c === ']') {
      if (stack.pop() !== c) return null
      if (stack.length === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/** Fence-strip and first {…} / […] — Flash often wraps JSON in markdown. */
export function extractJsonValue(raw: unknown): unknown {
  if (raw !== null && typeof raw === 'object') return raw
  if (typeof raw !== 'string') return undefined
  const text = raw.replace(/^\uFEFF/, '').trim()
  if (!text) return undefined
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = (fenced?.[1] ?? text).trim()
  const sliced = sliceFirstJsonValue(body)
  const candidates = [body, sliced].filter((c, i, all): c is string => Boolean(c) && all.indexOf(c) === i)
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      /* next */
    }
  }
  return undefined
}

export function extractJsonObject(raw: unknown): Record<string, unknown> | null {
  const value = extractJsonValue(raw)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function readPrompt(obj: Record<string, unknown>): string {
  for (const key of ['imagePrompt', 'prompt', 'image_prompt', 'imagePromptText']) {
    const v = obj[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

function asIdList(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(/[,;\s]+/)
      .map((id) => id.trim())
      .filter(Boolean)
  }
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      out.push(item.trim())
      continue
    }
    if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>
      const id = rec.id ?? rec.imageId ?? rec.ref
      if (typeof id === 'string' && id.trim()) out.push(id.trim())
    }
  }
  return out
}

function readIds(obj: Record<string, unknown>): string[] {
  for (const key of ['imageIds', 'image_ids', 'ids', 'images', 'refs', 'refIds', 'references']) {
    const ids = asIdList(obj[key])
    if (ids.length) return ids
  }
  return []
}

function unwrapPackzettel(obj: Record<string, unknown>): Record<string, unknown> {
  for (const key of ['packzettel', 'pack', 'result']) {
    const nested = obj[key]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const inner = nested as Record<string, unknown>
      if (readPrompt(inner) || readIds(inner).length) return inner
    }
  }
  return obj
}

export function parseStillEditPackzettel(raw: unknown): StillEditPackzettel {
  const obj = extractJsonObject(raw)
  if (!obj) throw new Error(STILL_EDIT_PLANNER_INVALID_DE)
  const source = unwrapPackzettel(obj)
  const imagePrompt = readPrompt(source)
  if (!imagePrompt) throw new Error(STILL_EDIT_PLANNER_INVALID_DE)
  return { imagePrompt, imageIds: uniqueStable(readIds(source)) }
}

export function pickStillCatalogImages(
  catalog: StillCatalogItem[],
  imageIds: string[],
): StillCatalogItem[] {
  const byId = new Map(catalog.map((it) => [it.id, it]))
  const out: StillCatalogItem[] = []
  const seenUrl = new Set<string>()
  for (const id of imageIds) {
    const hit = byId.get(id)
    if (!hit) continue
    if (seenUrl.has(hit.url)) continue
    seenUrl.add(hit.url)
    out.push(hit)
    if (out.length >= STILL_EDIT_PACK_MAX) break
  }
  return out
}

/** Kurze Beschriftung der angehängten Fotos — keine Sitzplan-Sperre. */
export function stillPackzettelAttachEn(labels: string[]): string {
  if (!labels.length) return ''
  const listed = labels.map((label, i) => `${i + 1}. ${label}`).join(' | ')
  return `Attached photos in this order: ${listed}. Use each photo only as that label says. Follow the image prompt.`
}

function stripVendorUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim()
}

/**
 * chatJson options for the Packzettel.
 * JSON mime is already the default. Do not send SDK responseSchema —
 * Google 400 Invalid JSON payload on both lite and flash (#79).
 */
export function stillEditPlannerChatJsonOpts(model: string, timeoutMs: number): {
  temperature: number
  timeoutMs: number
  timeoutMessage: string
  model: string
} {
  return {
    temperature: 0.2,
    timeoutMs,
    timeoutMessage: STILL_EDIT_PLANNER_TIMEOUT_DE,
    model,
  }
}

/** Parse [400 Bad Request] / "code":500 / (500) from a Google/SDK dump. */
export function stillEditPlannerGoogleHttpStatus(raw: string): number | null {
  const text = stripVendorUrls(raw)
  const patterns = [
    /\[(\d{3})\b[^\]]*\]/,
    /"code"\s*:\s*(\d{3})/,
    /\bHTTP\/?\d?(?:\.\d)?\s+(\d{3})\b/i,
    /\((4\d{2}|5\d{2})\)/,
    /\bstatus(?:Code)?["'\s:=]+(\d{3})\b/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (!m) continue
    const n = Number(m[1])
    if (n >= 400 && n < 600) return n
  }
  if (/invalid json payload|invalid.?argument|\bbad request\b/i.test(text)) return 400
  if (/\binternal server error\b/i.test(text)) return 500
  return null
}

const PLANNER_QUOTA_HINTS = [
  'quota',
  'resource_exhausted',
  'resource exhausted',
  'rate limit',
  'rate_limit',
  'generate_content_requests_per_minute',
  'overloaded',
  'überlast',
  'gerade voll',
]

/** Real 429/quota — a Google URL alone is not enough (SDK errors always contain one). */
export function isStillEditPlannerQuotaError(raw: string): boolean {
  const text = raw.trim()
  if (/\b429\b/.test(text)) return true
  const lower = text.toLowerCase()
  return PLANNER_QUOTA_HINTS.some((hint) => lower.includes(hint))
}

export async function withStillEditPlannerQuotaRetries<T>(
  run: () => Promise<T>,
  opts?: {
    sleep?: (ms: number) => Promise<void>
    now?: () => number
    retries?: number
    backoffMs?: number
    budgetMs?: number
  },
): Promise<T> {
  const sleep = opts?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const now = opts?.now ?? Date.now
  const retries = opts?.retries ?? STILL_EDIT_PLANNER_QUOTA_RETRIES
  const backoffMs = opts?.backoffMs ?? STILL_EDIT_PLANNER_QUOTA_BACKOFF_MS
  const budgetMs = opts?.budgetMs ?? STILL_EDIT_PLANNER_HTTP_BUDGET_MS
  const started = now()
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await run()
    } catch (err) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err ?? '')
      if (!isStillEditPlannerQuotaError(msg)) throw err
      if (attempt >= retries) break
      const remaining = budgetMs - (now() - started)
      if (remaining < backoffMs + 6_000) break
      await sleep(backoffMs)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? STILL_EDIT_PLANNER_QUOTA_DE))
}

const PLANNER_AUTH_OR_KEY =
  /nicht freigeschaltet|KI-Punkte konnten nicht|GEMINI_API_KEY ist nicht gesetzt|Ungültiger GEMINI_API_KEY|nicht angemeldet|sitzung abgelaufen/i

const PLANNER_APP_PASS_THROUGH =
  /kein storyboard|bild nicht gefunden|schreib zuerst|dialogId|panelId fehlt/i

/** Lite failed in a way that the same prompt on gemini-2.5-flash can still deliver a packzettel. */
export function isStillEditPlannerFlashFallbackError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  if (!msg.trim()) return true
  if (PLANNER_AUTH_OR_KEY.test(msg)) return false
  if (PLANNER_APP_PASS_THROUGH.test(msg)) return false
  return true
}

export function stillEditPackNeedsFlashFallback(
  pack: StillEditPackzettel | null | undefined,
  catalogLen: number,
): boolean {
  if (!pack?.imagePrompt?.trim()) return true
  return catalogLen > 0 && pack.imageIds.length === 0
}

/**
 * First gemini-2.5-flash-lite; if empty/invalid/404/500 (not only 404), same prompt on flash.
 */
export async function runStillEditPlannerModelAttempts<T extends StillEditPackzettel>(opts: {
  catalogLen: number
  primary?: string
  fallback?: string
  call: (model: string) => Promise<T>
  log?: (cause: unknown, model: string) => void
}): Promise<T> {
  const primary = opts.primary?.trim() || STILL_EDIT_PLANNER_MODEL
  const fallback = opts.fallback?.trim() || STILL_EDIT_PLANNER_FALLBACK_MODEL
  const tryModel = async (model: string): Promise<{ pack?: T; err?: unknown }> => {
    try {
      return { pack: await opts.call(model) }
    } catch (err) {
      opts.log?.(err, model)
      return { err }
    }
  }

  const first = await tryModel(primary)
  const firstNeedsFlash = first.err
    ? isStillEditPlannerFlashFallbackError(first.err)
    : stillEditPackNeedsFlashFallback(first.pack, opts.catalogLen)
  const canFlash =
    firstNeedsFlash &&
    primary !== fallback &&
    !/tts|image/i.test(fallback)

  if (canFlash) {
    const second = await tryModel(fallback)
    if (second.pack) {
      if (!stillEditPackNeedsFlashFallback(second.pack, opts.catalogLen) || !first.pack) {
        return second.pack
      }
      return second.pack.imagePrompt ? second.pack : first.pack
    }
    if (first.pack) return first.pack
    throw second.err ?? first.err ?? new Error(STILL_EDIT_PLANNER_EMPTY_DE)
  }

  if (first.pack) return first.pack
  throw first.err ?? new Error(STILL_EDIT_PLANNER_EMPTY_DE)
}

export function stillEditPlannerErrorDe(err: unknown): string {
  const original = err instanceof Error ? err.message : String(err ?? '')
  const raw = stripVendorUrls(original)
  if (raw === STILL_EDIT_PLANNER_QUOTA_DE || isStillEditPlannerQuotaError(original) || isStillEditPlannerQuotaError(raw)) {
    return STILL_EDIT_PLANNER_QUOTA_DE
  }
  if (
    raw === STILL_EDIT_PLANNER_TIMEOUT_DE ||
    raw === STILL_EDIT_PLANNER_EMPTY_DE ||
    raw === STILL_EDIT_PLANNER_INVALID_DE ||
    raw === STILL_EDIT_PLANNER_GOOGLE_DE
  ) {
    return raw
  }
  if (raw === STILL_EDIT_PLANNER_ERROR_DE) return STILL_EDIT_PLANNER_GOOGLE_DE
  if (PLANNER_AUTH_OR_KEY.test(raw) || PLANNER_APP_PASS_THROUGH.test(raw)) {
    return raw || STILL_EDIT_PLANNER_GOOGLE_DE
  }
  const status = stillEditPlannerGoogleHttpStatus(raw)
  if (/zeitlimit|zu lange|timeout|zeitüberschreitung|abort|deadline/i.test(raw) || status === 504) {
    return STILL_EDIT_PLANNER_TIMEOUT_DE
  }
  if (status === 429) return STILL_EDIT_PLANNER_QUOTA_DE
  if (
    /leere antwort|keine antwort|empty|no candidate|blocked|SAFETY|nicht erhalten|prompt.?feedback/i.test(
      raw,
    )
  ) {
    return STILL_EDIT_PLANNER_EMPTY_DE
  }
  if (
    /JSON der KI|unexpected token|not valid json|syntaxerror|ungültiger packzettel/i.test(raw)
  ) {
    return STILL_EDIT_PLANNER_INVALID_DE
  }
  if (status && status >= 400 && status < 600) {
    return stillEditPlannerStatusDe(status)
  }
  if (
    /google.?fehler|failed to fetch|fetch failed|networkerror|KI-Anfrage fehlgeschlagen|Anfrage fehlgeschlagen/i.test(
      raw,
    )
  ) {
    return STILL_EDIT_PLANNER_GOOGLE_DE
  }
  if (/bild ändern/i.test(raw) && /\(.*\)/.test(raw)) return raw
  if (/bild ändern/i.test(raw)) return STILL_EDIT_PLANNER_GOOGLE_DE
  return STILL_EDIT_PLANNER_GOOGLE_DE
}

/** Fehler von «Bild ändern» — nicht auf «Diese Szene erzeugen» umbiegen. */
export function stillEditTimeoutHintDe(message: string): string {
  const clean = stripVendorUrls(message)
  if (clean === STILL_EDIT_PLANNER_QUOTA_DE || isStillEditPlannerQuotaError(clean)) {
    return STILL_EDIT_PLANNER_QUOTA_DE
  }
  if (clean === STILL_EDIT_PLANNER_ERROR_DE) return STILL_EDIT_PLANNER_GOOGLE_DE
  if (/bild ändern|packzettel/i.test(clean) && clean !== STILL_EDIT_PLANNER_ERROR_DE) {
    return stillEditPlannerErrorDe(clean)
  }
  if (/zeitlimit|zu lange|timeout|FUNCTION_INVOCATION|zeitüberschreitung|504/i.test(clean)) {
    return STILL_EDIT_PLANNER_TIMEOUT_DE
  }
  if (/leere antwort/i.test(clean)) return STILL_EDIT_PLANNER_EMPTY_DE
  if (!clean.trim()) return STILL_EDIT_PLANNER_GOOGLE_DE
  return stillEditPlannerErrorDe(clean)
}

export function stillEditHarvestNoteDe(
  correction: string,
  picked: StillCatalogItem[],
): string {
  const listed = picked.length
    ? `Packzettel: ${picked.map((it) => it.label).join(', ')}.`
    : 'Packzettel ohne Vorlagenfoto.'
  return `${listed} Neu gemalt nach Hinweis: ${correction}`
}
