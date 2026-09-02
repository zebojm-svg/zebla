import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { CompositeCanvas, type LayerImage } from './CompositeCanvas'
import type { Dialog } from '../types'
import type { FilmPlacement, FilmStoryboard, FilmStoryboardPanel } from '../../shared/film-storyboard'
import {
  ARRANGE_CANVAS,
  arrangeLayersFromPanel,
  layerIdToPlacement,
  movePlacementByPixels,
  panelCanArrange,
  placementsToUpdates,
  scalePlacement,
} from '../../shared/film-still-arrange'

type Props = {
  dialogId: string
  panel: FilmStoryboardPanel
  interactive?: boolean
  onUpdated?: (dialog: Dialog, board: FilmStoryboard) => void
}

function toCanvasLayers(panel: FilmStoryboardPanel): LayerImage[] {
  return arrangeLayersFromPanel(panel).map((l) => ({ ...l }))
}

export function FilmStillPicture({
  dialogId,
  panel,
  interactive = false,
  onUpdated,
}: Props) {
  const can = panelCanArrange(panel)
  if (can) {
    return (
      <FilmStillArrange
        dialogId={dialogId}
        panel={panel}
        interactive={interactive}
        onUpdated={onUpdated}
      />
    )
  }
  if (panel.stillUrl) {
    return (
      <div className="film-still-flat">
        <img src={panel.stillUrl} alt={panel.caption} />
        {interactive ? (
          <p className="muted film-arrange-hint">
            Figuren und Ort getrennt in der{' '}
            <Link to={`/library?dialog=${dialogId}`}>Bibliothek</Link> — dann hier ziehen und
            zoomen, ohne KI.
          </p>
        ) : null}
      </div>
    )
  }
  return <div className="film-still-placeholder">Noch kein Bild</div>
}

export function FilmStillArrange({ dialogId, panel, interactive = true, onUpdated }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [local, setLocal] = useState(panel)
  const saveTimer = useRef<number | null>(null)

  useEffect(() => {
    setLocal(panel)
  }, [panel])

  const layers = useMemo(() => toCanvasLayers(local), [local])

  const persist = (next: FilmStoryboardPanel) => {
    if (!interactive || !onUpdated) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void api.ai
        .filmPanelLayout(dialogId, next.id, placementsToUpdates(next))
        .then(({ dialog, board }) => onUpdated(dialog, board))
        .catch(() => {
          /* Lage bleibt lokal */
        })
    }, 700)
  }

  const patchPlacement = (layerId: string, fn: (pl: FilmPlacement) => FilmPlacement) => {
    const pl = layerIdToPlacement(local, layerId)
    if (!pl) return
    const nextPl = fn(pl)
    const next: FilmStoryboardPanel = {
      ...local,
      placements: local.placements.map((p) => (p === pl ? nextPl : p)),
    }
    setLocal(next)
    persist(next)
  }

  return (
    <div className={`film-arrange${interactive ? ' is-edit' : ''}`}>
      <CompositeCanvas
        width={ARRANGE_CANVAS.width}
        height={ARRANGE_CANVAS.height}
        className="film-arrange-canvas"
        layers={layers}
        selectedLayerId={interactive ? selected : null}
        onSelectLayer={interactive ? setSelected : undefined}
        onDragLayer={
          interactive
            ? (layerId, dx, dy) => {
                patchPlacement(layerId, (pl) => movePlacementByPixels(pl, dx, dy))
              }
            : undefined
        }
        onWheelLayer={
          interactive
            ? (layerId, deltaScale) => {
                patchPlacement(layerId, (pl) => scalePlacement(pl, 1 + deltaScale))
              }
            : undefined
        }
      />
      {interactive ? (
        <p className="muted film-arrange-hint">
          <strong>Figuren stellen:</strong> ziehen zum Verschieben, Mausrad zum
          Verkleinern/Vergrößern — ohne KI. Z.B. neben die Rolltreppe.
        </p>
      ) : null}
    </div>
  )
}
