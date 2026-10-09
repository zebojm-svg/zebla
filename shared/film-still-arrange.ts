import {
  defaultPlacementY,
  type FilmPlacement,
  type FilmStoryboard,
  type FilmStoryboardPanel,
} from './film-storyboard.js'

export const ARRANGE_CANVAS = { width: 960, height: 540 } as const

const BASE_WIDTH_RATIO = 0.3
const FIGURE_ASPECT = 1.55

export type ArrangeDrawLayer = {
  id: string
  src: string
  x: number
  y: number
  width: number
  height: number
  flip?: boolean
  zIndex: number
  draggable: boolean
  keyOutWhite?: boolean
}

export function panelCanArrange(panel: FilmStoryboardPanel): boolean {
  const bg = panel.background.imageUrl?.trim()
  if (!bg) return false
  return panel.placements.some((pl) => Boolean(pl.imageUrl?.trim()))
}

export type ArrangeLayerUpdate = {
  name: string
  poseId: string
  x: number
  y: number
  scale: number
  flip?: boolean
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function figureLayerSize(scale: number, canvasW = ARRANGE_CANVAS.width): {
  width: number
  height: number
} {
  const width = Math.max(36, canvasW * BASE_WIDTH_RATIO * clamp(scale, 0.25, 1.8))
  return { width, height: width * FIGURE_ASPECT }
}

export function placementToLayer(
  pl: FilmPlacement,
  index: number,
  canvasW = ARRANGE_CANVAS.width,
  canvasH = ARRANGE_CANVAS.height,
): ArrangeDrawLayer | null {
  const src = pl.imageUrl?.trim()
  if (!src) return null
  const { width, height } = figureLayerSize(pl.scale, canvasW)
  const y = typeof pl.y === 'number' ? pl.y : defaultPlacementY(pl.depth)
  return {
    id: `fig-${index}-${pl.name}-${pl.poseId}`,
    src,
    x: (pl.x / 100) * canvasW - width / 2,
    y: (y / 100) * canvasH - height,
    width,
    height,
    flip: pl.flip,
    zIndex: pl.depth === 'foreground' ? 30 + index : pl.depth === 'background' ? 10 + index : 20 + index,
    draggable: true,
    keyOutWhite: true,
  }
}

export function arrangeLayersFromPanel(
  panel: FilmStoryboardPanel,
  canvasW = ARRANGE_CANVAS.width,
  canvasH = ARRANGE_CANVAS.height,
): ArrangeDrawLayer[] {
  const layers: ArrangeDrawLayer[] = []
  const bg = panel.background.imageUrl?.trim()
  if (bg) {
    layers.push({
      id: 'bg',
      src: bg,
      x: 0,
      y: 0,
      width: canvasW,
      height: canvasH,
      zIndex: 0,
      draggable: false,
    })
  }
  panel.placements.forEach((pl, i) => {
    const layer = placementToLayer(pl, i, canvasW, canvasH)
    if (layer) layers.push(layer)
  })
  return layers
}

export function layerIdToPlacement(
  panel: FilmStoryboardPanel,
  layerId: string,
): FilmPlacement | undefined {
  const m = /^fig-(\d+)-/.exec(layerId)
  if (!m) return undefined
  return panel.placements[Number(m[1])]
}

export function movePlacementByPixels(
  pl: FilmPlacement,
  dx: number,
  dy: number,
  canvasW = ARRANGE_CANVAS.width,
  canvasH = ARRANGE_CANVAS.height,
): FilmPlacement {
  const y = typeof pl.y === 'number' ? pl.y : defaultPlacementY(pl.depth)
  return {
    ...pl,
    x: clamp(pl.x + (dx / canvasW) * 100, 4, 96),
    y: clamp(y + (dy / canvasH) * 100, 18, 98),
    layoutLocked: true,
  }
}

export function scalePlacement(pl: FilmPlacement, factor: number): FilmPlacement {
  return {
    ...pl,
    scale: clamp(pl.scale * factor, 0.28, 1.8),
    layoutLocked: true,
  }
}

export function applyPanelLayout(
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
          const hit = byKey.get(`${pl.name}::${pl.poseId}`)
          if (!hit) return pl
          return {
            ...pl,
            x: clamp(hit.x, 4, 96),
            y: clamp(hit.y, 18, 98),
            scale: clamp(hit.scale, 0.28, 1.8),
            flip: hit.flip ?? pl.flip,
            layoutLocked: true,
          }
        }),
      }
    }),
  }
}

export function placementsToUpdates(panel: FilmStoryboardPanel): ArrangeLayerUpdate[] {
  return panel.placements.map((pl) => ({
    name: pl.name,
    poseId: pl.poseId,
    x: pl.x,
    y: typeof pl.y === 'number' ? pl.y : defaultPlacementY(pl.depth),
    scale: pl.scale,
    flip: pl.flip,
  }))
}
