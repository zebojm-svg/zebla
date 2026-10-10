/**
 * KI sieht den leeren Raum und legt Figuren sinnvoll (sitzen, Größe, Tiefe).
 */

import { chatJsonWithImages } from './ai.js'
import {
  applyAiLayout,
  heuristicSensibleLayout,
  layoutUserPrompt,
  parseSensibleLayout,
  SENSIBLE_LAYOUT_SYSTEM,
} from '../shared/film-sensible-layout.js'
import type { FilmScene, FilmStoryboard, FilmStoryboardPanel } from '../shared/film-storyboard.js'

async function fetchInline(url: string | undefined): Promise<{ mimeType: string; data: string } | null> {
  if (!url?.startsWith('http')) return null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12_000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 32) return null
    const mimeType = res.headers.get('content-type')?.split(';')[0] || 'image/png'
    return { mimeType, data: buf.toString('base64') }
  } catch {
    return null
  }
}

export async function proposeSensibleLayout(
  panel: FilmStoryboardPanel,
  scene?: FilmScene,
): Promise<ReturnType<typeof heuristicSensibleLayout>> {
  const fallback = heuristicSensibleLayout(panel)
  try {
    const room = await fetchInline(panel.background.imageUrl)
    const images = room ? [room] : []
    const raw = await chatJsonWithImages<{ placements?: unknown }>(
      SENSIBLE_LAYOUT_SYSTEM,
      layoutUserPrompt(panel, scene?.title),
      images,
    )
    return parseSensibleLayout(raw, panel) ?? fallback
  } catch {
    return fallback
  }
}

export async function applySensibleLayoutToBoard(
  board: FilmStoryboard,
  panel: FilmStoryboardPanel,
  scene?: FilmScene,
): Promise<FilmStoryboard> {
  const updates = await proposeSensibleLayout(panel, scene)
  return applyAiLayout(board, panel.id, updates)
}
