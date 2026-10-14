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

export type StillEditPlannerInput = {
  stillNumber: number
  panelId: string
  userHint: string
  dialogDe: string
  figures: string[]
  place: string
  catalog: StillCatalogItem[]
  styleLabel?: string
}

/** Höchstens so viele Fotos an die Bild-KI — Kapazität, keine Interpretation. */
export const STILL_EDIT_PACK_MAX = 4

export const STILL_EDIT_PLANNER_ERROR_DE =
  'Die Drehbuch-KI hat den Packzettel nicht geliefert. Bitte noch einmal «Bild ändern».'

export const STILL_EDIT_PLANNER_TIMEOUT_MS = 18_000

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

export function stillEditPlannerUser(input: StillEditPlannerInput): string {
  const catalogLines =
    input.catalog.length === 0
      ? '(leer)'
      : input.catalog.map((it) => `- id=${it.id} label=${it.label}`).join('\n')
  const figures = input.figures.filter(Boolean).join(', ') || '—'
  return [
    `Der User möchte Bild Nummer ${input.stillNumber} (id ${input.panelId}) verändern wie folgt: ${input.userHint}`,
    '',
    `Deutscher Dialog dieser Zeile: ${input.dialogDe}`,
    `Figuren: ${figures}`,
    `Ort: ${input.place || '—'}`,
    input.styleLabel ? `Stil: ${input.styleLabel}` : '',
    '',
    'Katalog der vorhandenen Bilder:',
    catalogLines,
    '',
    'Erstelle einen Prompt für die Bild-KI und sag welche Bild-ids ich mitschicken muss, damit das gut kommt.',
    'Beispiel nur als Prinzip, nicht kopieren: Hinweis «Ramo allein am Herd» → imageIds ohne aktuelles Tisch-Still, mit Ramo-Gesicht + Küche/Herd + Kanne; imagePrompt malt neu (restage, nicht retouch).',
  ]
    .filter((line) => line !== '')
    .join('\n')
}

export function stillEditPlannerMessages(input: StillEditPlannerInput): {
  system: string
  user: string
} {
  return { system: stillEditPlannerSystem(), user: stillEditPlannerUser(input) }
}

export function parseStillEditPackzettel(raw: unknown): StillEditPackzettel {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const imagePrompt = typeof obj.imagePrompt === 'string' ? obj.imagePrompt.trim() : ''
  if (!imagePrompt) throw new Error(STILL_EDIT_PLANNER_ERROR_DE)
  const ids = Array.isArray(obj.imageIds) ? obj.imageIds : []
  const imageIds = ids
    .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    .map((id) => id.trim())
  return { imagePrompt, imageIds }
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

export function stillEditPlannerErrorDe(err: unknown): string {
  const raw = err instanceof Error ? err.message : ''
  if (/bild ändern/i.test(raw)) return raw
  if (/quota|limit|überlast|overloaded/i.test(raw)) {
    return 'Die Drehbuch-KI ist gerade voll. Bitte noch einmal «Bild ändern».'
  }
  return STILL_EDIT_PLANNER_ERROR_DE
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
