import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  STORY_ART_STYLES,
  type StoryArtStyleId,
} from '../../shared/story-art-styles'
import type { Dialog } from '../types'
import type { FilmScene, FilmStoryboardPanel } from '../../shared/film-storyboard'
import { panelDialogueLines } from '../../shared/film-storyboard'
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

export function FilmPanelDialogue({
  panel,
  dialog,
}: {
  panel: FilmStoryboardPanel
  dialog?: Dialog | null
}) {
  const lines = panelDialogueLines(panel, dialog)
  return (
    <div className="film-still-under">
      {lines.length > 0 ? (
        <div className="film-still-dialog">
          {lines.map((line, i) => (
            <p key={line.lineId ?? `${panel.id}-${i}`}>
              {line.speaker ? <strong>{line.speaker}: </strong> : null}
              {line.text}
            </p>
          ))}
        </div>
      ) : panel.caption ? (
        <p className="film-still-dialog">{panel.caption}</p>
      ) : null}
      {panel.imageCue || panel.soundCue || panel.speechCue ? (
        <ul className="film-cues film-cues-muted">
          {panel.imageCue ? <li>Bild: {panel.imageCue}</li> : null}
          {panel.soundCue ? <li>Ton: {panel.soundCue}</li> : null}
          {panel.speechCue ? <li>Sprache: {panel.speechCue}</li> : null}
        </ul>
      ) : null}
    </div>
  )
}

export function FilmStillFixBar({
  panel,
  busy,
  onCorrect,
  onInsert,
}: {
  panel: FilmStoryboardPanel
  busy: boolean
  onCorrect?: (note: string) => void
  onInsert?: (text: string) => void
}) {
  const [note, setNote] = useState(panel.stillCorrection ?? '')
  const [insertText, setInsertText] = useState('')
  if (!onCorrect && !onInsert) return null
  return (
    <div className="film-still-fix">
      {onCorrect ? (
        <div className="film-tweak">
          <input
            className="input"
            value={note}
            disabled={busy}
            placeholder="Was stimmt nicht? z.B. Prospekt fehlt, beide schauen in die Luft"
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy || !note.trim()}
            onClick={() => onCorrect(note.trim())}
          >
            Bild korrigieren
          </button>
        </div>
      ) : null}
      {onInsert ? (
        <div className="film-tweak">
          <input
            className="input"
            value={insertText}
            disabled={busy}
            placeholder="z.B. Nahaufnahme Prospekt, man sieht direkt hinein"
            onChange={(e) => setInsertText(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy || !insertText.trim()}
            onClick={() => {
              onInsert(insertText.trim())
              setInsertText('')
            }}
          >
            Bild danach einfügen
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function FilmStillStrip({
  panels,
  dialog,
  busy,
  busyPanelId,
  onCorrect,
  onInsert,
}: {
  panels: FilmStoryboardPanel[]
  dialog?: Dialog | null
  busy?: boolean
  busyPanelId?: string | null
  onCorrect?: (panel: FilmStoryboardPanel, note: string) => void
  onInsert?: (panel: FilmStoryboardPanel, text: string) => void
}) {
  if (panels.length === 0) return null
  return (
    <div className="film-still-strip">
      {panels.map((panel) => {
        const panelBusy = Boolean(busy && busyPanelId === panel.id)
        return (
          <figure key={panel.id} className="film-still-thumb">
            {panel.stillUrl ? (
              <img src={panel.stillUrl} alt={panel.caption} />
            ) : (
              <div className="film-still-placeholder">
                {panelBusy ? 'Erzeuge Bild …' : 'Noch kein Bild'}
              </div>
            )}
            <figcaption>
              Bild {panel.panelIndex}
              {panel.stillError ? <span className="film-still-err"> · Fehler</span> : null}
              {panelBusy ? <span> · wird korrigiert …</span> : null}
            </figcaption>
            <FilmPanelDialogue panel={panel} dialog={dialog} />
            <FilmStillFixBar
              panel={panel}
              busy={Boolean(busy)}
              onCorrect={onCorrect ? (note) => onCorrect(panel, note) : undefined}
              onInsert={onInsert ? (text) => onInsert(panel, text) : undefined}
            />
          </figure>
        )
      })}
    </div>
  )
}
