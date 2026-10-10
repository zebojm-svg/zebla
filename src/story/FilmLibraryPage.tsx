import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { FilmProjectNav } from './FilmProjectNav'
import type { StoryLibraryAsset } from '../../shared/story-types'
import { getStillPose } from '../../shared/story-stills'
import { isLibraryShelf, LIBRARY_SHELVES, type LibraryShelfId } from '../../shared/story-project'
import {
  isCutoutFromStill,
  partitionLibraryCharacters,
  type LibraryIdentityGroup,
} from '../../shared/library-identities'
import { StoryPictogram, type StoryPictogramName } from './StoryPictogram'

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
  const [bulkBusy, setBulkBusy] = useState(false)

  const load = async () => {
    const { assets: list } = await api.story.listLibrary()
    setAssets(list)
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : 'Fehler'))
      .finally(() => setLoading(false))
  }, [])

  const characters = useMemo(
    () => assets.filter((a) => a.type === 'character'),
    [assets],
  )
  const environments = useMemo(
    () => assets.filter((a) => a.type === 'environment'),
    [assets],
  )
  const props = useMemo(() => assets.filter((a) => a.type === 'prop'), [assets])
  const sketches = useMemo(
    () => assets.filter((a) => (a.tags ?? []).includes('sketch')),
    [assets],
  )
  const grouped = useMemo(() => partitionLibraryCharacters(characters), [characters])

  const needle = filter.trim().toLowerCase()
  const shownIdentities = needle
    ? grouped.identities.filter((i) => i.displayName.toLowerCase().includes(needle))
    : grouped.identities
  const shownHarvested = needle
    ? grouped.harvested.filter((e) =>
        [e.name, e.description ?? '', ...(e.tags ?? [])].join(' ').toLowerCase().includes(needle),
      )
    : grouped.harvested
  const shownEnvs = needle
    ? environments.filter((e) =>
        [e.name, e.description ?? '', ...(e.tags ?? [])].join(' ').toLowerCase().includes(needle),
      )
    : environments
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

  const removeMany = async (ids: string[]) => {
    const unique = [...new Set(ids.filter(Boolean))]
    if (unique.length === 0) return
    if (
      !window.confirm(
        unique.length === 1
          ? 'Diesen Eintrag aus der Bibliothek löschen?'
          : `${unique.length} Einträge aus der Bibliothek löschen?`,
      )
    ) {
      return
    }
    setBulkBusy(true)
    setError('')
    const failed: string[] = []
    for (const id of unique) {
      try {
        await api.story.deleteFromLibrary(id)
        setAssets((prev) => prev.filter((a) => a.id !== id))
      } catch {
        failed.push(id)
      }
    }
    setConfirmId(null)
    setBulkBusy(false)
    if (failed.length) {
      setError(`${failed.length} Einträge konnten nicht gelöscht werden. Bitte einzeln versuchen.`)
      try {
        await load()
      } catch {
        /* ignore */
      }
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
          <h1>Welt</h1>
        </div>
        <Link to={dialogId ? `/story?dialog=${dialogId}` : '/story'} className="btn btn-ghost">
          Nur wenn etwas fehlt: zeichnen
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="library-shelf-tabs" role="tablist" aria-label="Welt-Regal">
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

      {loading ? (
        <p className="muted">Lade Bibliothek …</p>
      ) : (
        <>
          {shelf === 'character' && (
            <>
              <h2>Figuren</h2>
              {shownIdentities.length === 0 && shownHarvested.length === 0 ? (
                <p className="muted">
                  Noch keine Figur.{' '}
                  <Link to="/story">Zeichnen</Link>
                </p>
              ) : (
                shownIdentities.map((identity: LibraryIdentityGroup) => (
                  <section key={identity.key} className="film-identity">
                    <h3>
                      {identity.displayName}{' '}
                      <span className="muted">
                        {identity.assets.length} Pose{identity.assets.length === 1 ? '' : 'n'}
                      </span>
                    </h3>
                    <div className="story-character-grid">
                      {identity.assets.map((asset) => (
                        <LibraryCard key={asset.id} asset={asset} {...cardProps} />
                      ))}
                    </div>
                    {identity.assets.length > 1 ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={bulkBusy}
                        onClick={() => void removeMany(identity.assets.map((a) => a.id))}
                      >
                        Alle Posen von {identity.displayName} löschen
                      </button>
                    ) : null}
                  </section>
                ))
              )}
              {shownHarvested.length > 0 ? (
                <section className="film-identity film-identity-harvest">
                  <h3>Aus Gruppenbild geschnitten</h3>
                  <p className="alert alert-warn">
                    Diese Bilder kleben oft am Sofa oder sind zu klein. Nicht als Stamm-Figur
                    verwenden — lieber löschen. Stehende Posen entstehen aus der sauberen
                    Studio-Figur darüber.
                  </p>
                  <div className="story-character-grid">
                    {shownHarvested.map((asset) => (
                      <LibraryCard
                        key={asset.id}
                        asset={asset}
                        badge="geschnitten"
                        {...cardProps}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={bulkBusy}
                    onClick={() => void removeMany(shownHarvested.map((a) => a.id))}
                  >
                    {bulkBusy ? '…' : 'Alle geschnittenen Figuren löschen'}
                  </button>
                </section>
              ) : null}
            </>
          )}

          {shelf === 'environment' && (
            <>
              <h2>Räume</h2>
              {shownEnvs.length === 0 ? (
                <p className="muted">
                  Noch kein Raum. Einmal aus einer Szene ernten oder zeichnen — dann in jeder Geschichte
                  gratis.
                </p>
              ) : (
                <div className="story-character-grid">
                  {shownEnvs.map((asset) => (
                    <LibraryCard key={asset.id} asset={asset} {...cardProps} />
                  ))}
                </div>
              )}
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
        </>
      )}
    </div>
  )
}
