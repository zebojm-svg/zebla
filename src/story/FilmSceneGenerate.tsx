import { Link } from 'react-router-dom'
import {
  STORY_ART_STYLES,
  type StoryArtStyleId,
} from '../../shared/story-art-styles'
import type { FilmScene, FilmStoryboardPanel } from '../../shared/film-storyboard'
import { sceneStillProgress, stillLibraryHintDe } from '../../shared/film-stills'

type Props = {
  dialogId: string
  scene: FilmScene
  panels: FilmStoryboardPanel[]
  styleId: string
  onStyleChange: (styleId: string) => void
  busy: boolean
  extraDisabled?: boolean
  progress?: { current: number; total: number } | null
  error?: string
  onGenerate: (force: boolean) => void
}

export function FilmSceneGenerateBar({
  dialogId,
  scene,
  panels,
  styleId,
  onStyleChange,
  busy,
  extraDisabled,
  progress,
  error,
  onGenerate,
}: Props) {
  const stats = sceneStillProgress(panels, styleId)
  const hint = stillLibraryHintDe(panels)
  const allDone = stats.total > 0 && stats.pending === 0
  const label = busy
    ? progress
      ? `Erzeuge Szene … Bild ${progress.current} von ${progress.total}`
      : 'Erzeuge Szene …'
    : allDone
      ? 'Szene nochmals erzeugen'
      : stats.done > 0
        ? 'Fehlende Bilder erzeugen'
        : 'Diese Szene erzeugen'

  return (
    <div className="film-scene-generate">
      <label className="film-scene-style">
        <span>Stil dieser Szene</span>
        <select
          value={styleId}
          disabled={busy || extraDisabled}
          onChange={(e) => onStyleChange(e.target.value as StoryArtStyleId)}
        >
          {STORY_ART_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn btn-story-studio film-scene-make"
        disabled={busy || extraDisabled || stats.total === 0}
        onClick={() => onGenerate(allDone)}
      >
        {label}
      </button>
      <p className="muted film-scene-still-note">
        Das sind <strong>Standbilder</strong> dieser Szene — damit du siehst, ob es gut
        herauskommt. Der bewegte Film kommt später.
        {stats.done > 0 ? ` ${stats.done} von ${stats.total} Bildern fertig.` : ''}
      </p>
      {busy ? (
        <p className="film-scene-progress" aria-live="polite">
          Erzeuge Szene «{scene.title}»
          {progress ? ` — Bild ${progress.current} von ${progress.total}` : ' …'}
        </p>
      ) : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      {hint ? (
        <p className="alert alert-warn">
          {hint}{' '}
          <Link to={`/library?dialog=${dialogId}`}>Zur Bibliothek</Link>
        </p>
      ) : null}
    </div>
  )
}

export function FilmStillStrip({ panels }: { panels: FilmStoryboardPanel[] }) {
  if (panels.length === 0) return null
  return (
    <div className="film-still-strip">
      {panels.map((panel) => (
        <figure key={panel.id} className="film-still-thumb">
          {panel.stillUrl ? (
            <img src={panel.stillUrl} alt={panel.caption} />
          ) : (
            <div className="film-still-placeholder">Noch kein Bild</div>
          )}
          <figcaption>
            Bild {panel.panelIndex}
            {panel.stillError ? <span className="film-still-err"> · Fehler</span> : null}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
