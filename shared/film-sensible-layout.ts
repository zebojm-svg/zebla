/**
 * Figuren einzeln, Raum einzeln — dann sinnvoll legen (sitzen im Möbel, gleiche Größe).
 */

import type { FilmStoryboard, FilmStoryboardPanel } from './film-storyboard.js'
import { defaultPlacementY } from './film-storyboard.js'
import type { ArrangeLayerUpdate } from './film-still-arrange.js'
import { harvestPropsFromText } from './film-library-harvest.js'

export const SENSIBLE_LAYOUT_SYSTEM = `Du bist Bildregie für ein Sprachlern-Bilderbuch (wie BookBox).
Du siehst ein Zimmer OHNE Leute. Figuren existieren schon als einzelne Sprites. Du legst sie nur.
«Sinnvoll» heißt:
- Wer sitzt, sitzt IM Möbel (Sofa, Sessel, Bank, Stuhl): Hüfte auf der Sitzfläche, Rücken zur Lehne. Nicht davor schweben, nicht durch die Lehne, nicht als stehende Ganzfigur auf den Stuhl kleben.
- Wer steht, hat beide Füße auf dem Boden.
- Gleiche Körpergröße im gleichen Raum.
- Hinten kleiner, vorne größer.
- Niemand verdeckt ein Gesicht komplett. Keine zwei Personen auf derselben Stelle.
- x = Mitte der Figur, 0–100 von links.
- y = immer die FÜSSE auf der Bodenebene, 0–100 von oben. Sitz-Sprites haben schon gebeugte Knie: y NICHT auf die Sitzfläche setzen (sonst schweben die Füße auf dem Polster). Sofa im Mittelgrund: Füße oft y 80–90.
- scale 0.45–1.15 (1.0 = normale Vordergrundfigur, sitzend eher 0.62–0.82, damit die Hüfte auf der Sitzfläche landet).
Nur JSON:
{ "placements": [{ "name": "Julien", "poseId": "sitting", "x": 32, "y": 84, "scale": 0.72, "flip": false }] }`

export function isSittingPose(poseId: string, poseHint = ''): boolean {
  const hay = `${poseId} ${poseHint}`.toLowerCase()
  return /sitt|sitz|seated|assis/.test(hay)
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function spreadX(count: number, index: number, start = 26, end = 74): number {
  if (count <= 1) return (start + end) / 2
  return start + ((end - start) * index) / (count - 1)
}

/** Ohne KI: sitzen auf Sitzfläche, stehen auf dem Boden, nicht übereinander. */
export function heuristicSensibleLayout(panel: FilmStoryboardPanel): ArrangeLayerUpdate[] {
  const furniture = harvestPropsFromText(
    `${panel.settingHint} ${panel.imageCue} ${panel.caption} ${panel.background.hint}`,
  )
  const hasSeat = furniture.some((p) =>
    ['sofa', 'sessel', 'stuhl', 'bank', 'hocker'].includes(p.key),
  )
  const sitters = panel.placements.filter((p) => isSittingPose(p.poseId, p.poseHint))
  const standers = panel.placements.filter((p) => !isSittingPose(p.poseId, p.poseHint))

  const updates: ArrangeLayerUpdate[] = []
  sitters.forEach((pl, i) => {
    updates.push({
      name: pl.name,
      poseId: pl.poseId,
      x: spreadX(sitters.length, i, hasSeat ? 24 : 28, hasSeat ? 58 : 70),
      y: defaultPlacementY(pl.depth),
      scale: pl.depth === 'background' ? 0.52 : 0.68,
      flip: pl.flip,
    })
  })
  standers.forEach((pl, i) => {
    const x = spreadX(standers.length, i, sitters.length ? 62 : 28, 86)
    updates.push({
      name: pl.name,
      poseId: pl.poseId,
      x,
      y: defaultPlacementY(pl.depth),
      scale: pl.depth === 'background' ? 0.55 : pl.depth === 'foreground' ? 0.95 : 0.78,
      flip: pl.flip,
    })
  })
  return updates
}

export function parseSensibleLayout(
  raw: unknown,
  panel: FilmStoryboardPanel,
): ArrangeLayerUpdate[] | null {
  if (!raw || typeof raw !== 'object') return null
  const list = (raw as { placements?: unknown }).placements
  if (!Array.isArray(list) || list.length === 0) return null
  const byName = new Map(panel.placements.map((p) => [p.name.trim().toLowerCase(), p]))
  const out: ArrangeLayerUpdate[] = []
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const r = row as {
      name?: unknown
      poseId?: unknown
      x?: unknown
      y?: unknown
      scale?: unknown
      flip?: unknown
    }
    const name = typeof r.name === 'string' ? r.name.trim() : ''
    const hit = byName.get(name.toLowerCase())
    if (!hit) continue
    const x = typeof r.x === 'number' ? r.x : Number(r.x)
    const y = typeof r.y === 'number' ? r.y : Number(r.y)
    const scale = typeof r.scale === 'number' ? r.scale : Number(r.scale)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(scale)) continue
    out.push({
      name: hit.name,
      poseId: hit.poseId,
      x: clamp(x, 8, 92),
      y: clamp(y, 22, 96),
      scale: clamp(scale, 0.4, 1.2),
      flip: Boolean(r.flip),
    })
  }
  return out.length > 0 ? out : null
}

export function layoutUserPrompt(panel: FilmStoryboardPanel, sceneTitle?: string): string {
  const furniture = harvestPropsFromText(
    `${panel.settingHint} ${panel.imageCue} ${panel.caption} ${panel.background.hint}`,
  )
  const people = panel.placements
    .map((p) => {
      const sit = isSittingPose(p.poseId, p.poseHint)
        ? 'SITTING sprite (knees already bent). Put FEET on the floor so hips land on the seat.'
        : 'standing, feet on the floor'
      return `- ${p.name}: pose ${p.poseId} (${p.poseHint}), ${sit}, depth ${p.depth}`
    })
    .join('\n')
  return [
    `Scene: ${sceneTitle || 'Scene'}.`,
    `Place: ${panel.settingHint || panel.background.hint || 'room'}.`,
    `Action: ${panel.caption}.`,
    panel.imageCue ? `What we see: ${panel.imageCue}.` : '',
    furniture.length ? `Furniture in the room: ${furniture.map((f) => f.en).join(', ')}.` : '',
    `People to place (sprites already exist, do not invent extra people):`,
    people,
    `The attached photo is the EMPTY room. Place people onto that photo.`,
  ]
    .filter(Boolean)
    .join('\n')
}

export function applyAiLayout(
  board: FilmStoryboard,
  panelId: string,
  updates: ArrangeLayerUpdate[],
): FilmStoryboard {
  return {
    ...board,
    updatedAt: new Date().toISOString(),
    panels: board.panels.map((panel) => {
      if (panel.id !== panelId) return panel
      const byKey = new Map(updates.map((u) => [`${u.name}::${u.poseId}`, u]))
      return {
        ...panel,
        placements: panel.placements.map((pl) => {
          if (pl.layoutLocked) return pl
          const hit = byKey.get(`${pl.name}::${pl.poseId}`)
          if (!hit) return pl
          return {
            ...pl,
            x: hit.x,
            y: hit.y,
            scale: hit.scale,
            flip: hit.flip ?? pl.flip,
            layoutByAi: true,
          }
        }),
      }
    }),
  }
}
