import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { FilmProjectNav } from './FilmProjectNav'
import type { StoryLibraryAsset } from '../../shared/story-types'
import { getStillPose } from '../../shared/story-stills'
import { isLibraryShelf, LIBRARY_SHELVES, type LibraryShelfId } from '../../shared/story-project'
import { isCutoutFromStill } from '../../shared/library-identities'
import { StoryPictogram, type StoryPictogramName } from './StoryPictogram'
import { ReferenceCatalog } from './ReferenceCatalog'
const SHELF_ICON: Record<LibraryShelfId, StoryPictogramName> = {
  character: 'person',
  environment: 'room',
  prop: 'chair',
  sketch: 'sketch',
}

function poseSubtitle(asset: StoryLibraryAsset): string {
  if (asset.legPoseId || asset.headAngleId || asset.armPoseId) {
    const still = getStillPose(
      asset.tags?.find((t) =>
        ['sitting', 'waving', 'walking', 'look-left', 'look-right', 'standing-front', 'standing-three-quarter'].includes(
          t,
        ),
      ),
    )
    return still.label
  }
  return asset.tags?.slice(0, 3).join(', ') || 'Figur'
}

function LibraryCard({
  asset,
  confirmId,
  pendingId,
  badge,
  onAsk,
  onCancel,
  onDelete,
}: {
  asset: StoryLibraryAsset
  confirmId: string | null
  pendingId: string | null
  badge?: string
  onAsk: (id: string) => void
  onCancel: () => void
  onDelete: (id: string) => void
}) {
  const pending = pendingId === asset.id
  const confirm = confirmId === asset.id
  return (
    <article className={`story-character-card${isCutoutFromStill(asset) ? ' is-harvest' : ''}`}>
      <img src={asset.imageUrl} alt={asset.name} />
      <p>{asset.name}</p>
      <p className="story-card-subtitle muted">
        {badge ? `${badge} · ` : ''}
        {poseSubtitle(asset)}
      </p>
      <div className="story-character-card-actions">
        {confirm ? (
          <>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={pending || !asset.id}
              onClick={() => onDelete(asset.id)}
            >
              {pending ? '…' : 'Ja, löschen'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={onCancel}>
              Abbrechen
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pending || !asset.id}
            onClick={() => onAsk(asset.id)}
          >
            Löschen
          </button>
        )}
      </div>
    </article>
  )
}

export function FilmLibraryPage() {
  const [params, setParams] = useSearchParams()
  const dialogId = params.get('dialog') ?? undefined
  const shelfParam = params.get('shelf')
  const shelf: LibraryShelfId = isLibraryShelf(shelfParam) ? shelfParam : 'character'
  const [assets, setAssets] = useState<StoryLibraryAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const load = async () => {
    const { assets: list } = await api.story.listLibrary()
    setAssets(list)
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : 'Fehler'))
      .finally(() => setLoading(false))
  }, [])

  const props = useMemo(() => assets.filter((a) => a.type === 'prop'), [assets])
  const sketches = useMemo(
    () => assets.filter((a) => (a.tags ?? []).includes('sketch')),
    [assets],
  )
  const needle = filter.trim().toLowerCase()
  const shownSketches = needle
    ? sketches.filter((e) =>
        [e.name, e.description ?? '', ...(e.tags ?? [])].join(' ').toLowerCase().includes(needle),
      )
    : sketches
  const shownProps = needle
    ? props.filter((e) =>
        [e.name, e.description ?? '', ...(e.tags ?? [])].join(' ').toLowerCase().includes(needle),
      )
    : props

  const openShelf = (id: LibraryShelfId) => {
    const next = new URLSearchParams(params)
    next.set('shelf', id)
    setParams(next, { replace: true })
  }

  const remove = async (id: string) => {
    if (!id) {
      setError('Dieser Eintrag hat keine ID — bitte die Seite neu laden.')
      return
    }
    setPendingId(id)
    setError('')
    try {
      await api.story.deleteFromLibrary(id)
      setAssets((prev) => prev.filter((a) => a.id !== id))
      setConfirmId(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Löschen fehlgeschlagen.'
      setError(msg)
      window.alert(msg)
      try {
        await load()
      } catch {
        /* Liste bleibt wie sie ist */
      }
    } finally {
      setPendingId(null)
    }
  }

  const cardProps = {
    confirmId,
    pendingId,
    onAsk: (id: string) => setConfirmId(id),
    onCancel: () => setConfirmId(null),
    onDelete: (id: string) => void remove(id),
  }

  return (
    <div className="page film-library-page">
      <FilmProjectNav dialogId={dialogId} />
      <div className="page-header">
        <div>
          <h1>Katalog</h1>
          <p className="muted">
            Neue Figuren stehen hier, mit dem Satz, mit dem sie gezeichnet wurden. Die bisherigen liegen im Archiv.
          </p>
        </div>
        <Link to={dialogId ? `/story?dialog=${dialogId}` : '/story'} className="btn btn-ghost">
          Nur wenn etwas fehlt: zeichnen
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <p className="muted">Lade Katalog …</p>
      ) : (
        <>
          <ReferenceCatalog assets={assets} onChange={load} dialogId={dialogId} />
          <details className="catalog-archive">
          <summary>Altes Regal</summary>
          <p className="muted">
            Ausschnitte von früher, zum Hinlegen in eine Szene. Für dieselbe Figur zählt die Referenz oben.
          </p>
          <div className="library-shelf-tabs" role="tablist" aria-label="Altes Regal">
            {LIBRARY_SHELVES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={shelf === item.id}
                className={`library-shelf-tab${shelf === item.id ? ' is-active' : ''}`}
                onClick={() => openShelf(item.id)}
              >
                <StoryPictogram name={SHELF_ICON[item.id]} />
                <strong>{item.title}</strong>
              </button>
            ))}
          </div>
          <input
            className="input"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Suchen: Julien, Park, Stuhl …"
          />
          {shelf === 'character' && (
            <>
              <h2>Figuren</h2>
              <p className="muted">
                Die Figuren stehen oben im Katalog. Zuerst der Stil, dann eine Figur im Stehen.
                Ein Klick zeigt die anderen Ansichten.
              </p>
            </>
          )}

          {shelf === 'environment' && (
            <>
              <h2>Räume</h2>
              <p className="muted">
                Die Räume stehen oben im Katalog. Zuerst der Stil, dann der Ort:
                Draussen, Wald, Strand, Küche, Wohnzimmer.
              </p>
            </>
          )}

          {shelf === 'prop' && (
            <>
              <h2>Möbel</h2>
              {shownProps.length === 0 ? (
                <p className="muted">
                  Noch kein Möbelstück. Steht im Bild ein Stuhl, eine Bank oder eine Rolltreppe,
                  landet das nach dem Ernten einer Szene hier — dann ohne KI wiederverwenden.
                </p>
              ) : (
                <div className="story-character-grid">
                  {shownProps.map((asset) => (
                    <LibraryCard key={asset.id} asset={asset} {...cardProps} />
                  ))}
                </div>
              )}
            </>
          )}

          {shelf === 'sketch' && (
            <>
              <h2>Storyboard-Skizzen</h2>
              {shownSketches.length === 0 ? (
                <p className="muted">
                  Skizzen entstehen im Storyboard per Knopf «Skizze» — nur wenn du Gesichter sehen
                  willst (kostet ein günstiges Bild).
                </p>
              ) : (
                <div className="story-character-grid">
                  {shownSketches.map((asset) => (
                    <LibraryCard key={asset.id} asset={asset} {...cardProps} />
                  ))}
                </div>
              )}
            </>
          )}
          </details>
        </>
      )}
    </div>
  )
}
