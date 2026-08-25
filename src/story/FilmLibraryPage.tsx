import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { FilmProjectNav } from './FilmProjectNav'
import type { StoryLibraryAsset } from '../../shared/story-types'
import { listCharacterIdentities } from './pose-variants'
import { characterBaseName } from '../../shared/character-parts'
import { getStillPose } from '../../shared/story-stills'

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
  const [params] = useSearchParams()
  const dialogId = params.get('dialog') ?? undefined
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
    () => assets.filter((a) => a.type === 'environment' || a.type === 'scene'),
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
          <h1>Bibliothek</h1>
          <p className="muted">
            Posen, Hintergründe und alles Wiederverwendbare. Das Storyboard schaut zuerst hier nach — zeichnen
            nur, wenn etwas fehlt.
          </p>
        </div>
        <Link to="/story" className="btn btn-secondary">
          Neu zeichnen
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <input
        className="input"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Suchen: Julien, Park …"
      />

      {loading ? (
        <p className="muted">Lade Bibliothek …</p>
      ) : (
        <>
          <h2>Figuren</h2>
          {shownIdentities.length === 0 ? (
            <p className="muted">
              Noch keine Figur. Im Storyboard «Julien sitzt» schreiben — oder einmal{' '}
              <Link to="/story">Stamm-Bild zeichnen</Link>.
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

          <h2>Hintergründe</h2>
          {shownEnvs.length === 0 ? (
            <p className="muted">Noch kein Hintergrund. Einmal zeichnen, dann in jeder Szene gratis.</p>
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
    </div>
  )
}
