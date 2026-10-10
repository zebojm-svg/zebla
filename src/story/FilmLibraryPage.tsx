import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { FilmProjectNav } from './FilmProjectNav'
import type { StoryLibraryAsset } from '../../shared/story-types'
import { listCharacterIdentities } from './pose-variants'
import { characterBaseName } from '../../shared/character-parts'
import { getStillPose } from '../../shared/story-stills'
import { isLibraryShelf, LIBRARY_SHELVES, type LibraryShelfId } from '../../shared/story-project'
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

export function FilmLibraryPage() {
  const [params, setParams] = useSearchParams()
  const dialogId = params.get('dialog') ?? undefined
  const shelfParam = params.get('shelf')
  const shelf: LibraryShelfId = isLibraryShelf(shelfParam) ? shelfParam : 'character'
  const [assets, setAssets] = useState<StoryLibraryAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')

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
  const identities = useMemo(() => listCharacterIdentities(characters, []), [characters])

  const needle = filter.trim().toLowerCase()
  const shownIdentities = needle
    ? identities.filter((i) => i.baseName.toLowerCase().includes(needle))
    : identities
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
    if (!window.confirm('Diesen Eintrag aus der Bibliothek löschen?')) return
    try {
      await api.story.deleteFromLibrary(id)
      setAssets((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.')
    }
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
              {shownIdentities.length === 0 ? (
                <p className="muted">
                  Noch keine Figur.{' '}
                  <Link to="/story">Zeichnen</Link>
                </p>
              ) : (
                shownIdentities.map((identity) => {
                  const poses = characters.filter(
                    (c) =>
                      identity.libraryIds.includes(c.id) ||
                      characterBaseName(c.name).toLowerCase() === identity.baseName.toLowerCase(),
                  )
                  return (
                    <section key={identity.baseName} className="film-identity">
                      <h3>
                        {identity.baseName}{' '}
                        <span className="muted">
                          {identity.variantCount} Pose{identity.variantCount === 1 ? '' : 'n'}
                        </span>
                      </h3>
                      <div className="story-character-grid">
                        {poses.map((asset) => (
                          <article key={asset.id} className="story-character-card">
                            <img src={asset.imageUrl} alt={asset.name} />
                            <p>{asset.name}</p>
                            <p className="story-card-subtitle muted">{poseSubtitle(asset)}</p>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => void remove(asset.id)}
                            >
                              Löschen
                            </button>
                          </article>
                        ))}
                      </div>
                    </section>
                  )
                })
              )}
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
                    <article key={asset.id} className="story-character-card">
                      <img src={asset.imageUrl} alt={asset.name} />
                      <p>{asset.name}</p>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void remove(asset.id)}
                      >
                        Löschen
                      </button>
                    </article>
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
                    <article key={asset.id} className="story-character-card">
                      <img src={asset.imageUrl} alt={asset.name} />
                      <p>{asset.name}</p>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void remove(asset.id)}
                      >
                        Löschen
                      </button>
                    </article>
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
                    <article key={asset.id} className="story-character-card">
                      <img src={asset.imageUrl} alt={asset.name} />
                      <p>{asset.name}</p>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void remove(asset.id)}
                      >
                        Löschen
                      </button>
                    </article>
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
