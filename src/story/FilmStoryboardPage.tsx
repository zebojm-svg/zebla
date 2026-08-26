import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { FilmProjectNav } from './FilmProjectNav'
import type { Dialog } from '../types'
import type { FilmStoryboard, FilmStoryboardPanel } from '../../shared/film-storyboard'
import {
  boardNeedsDrawing,
  normalizeFilmStoryboard,
} from '../../shared/film-storyboard'

function matchClass(kind: string) {
  if (kind === 'reuse') return 'is-reuse'
  if (kind === 'transform') return 'is-transform'
  return 'is-missing'
}

function matchLabel(kind: string) {
  if (kind === 'reuse') return 'Aus der Bibliothek'
  if (kind === 'transform') return 'Spiegeln / zoomen'
  return 'Noch zeichnen'
}

function PanelCard({
  panel,
  busy,
  onTweak,
  onComment,
  onInsert,
  onSketch,
}: {
  panel: FilmStoryboardPanel
  busy: boolean
  onTweak: (note: string) => void
  onComment: (comment: string) => void
  onInsert: (text: string) => void
  onSketch: () => void
}) {
  const [note, setNote] = useState(panel.directorNote ?? '')
  const [comment, setComment] = useState(panel.comment ?? '')
  const [insertText, setInsertText] = useState('')
  const bg = panel.background

  return (
    <article className="film-panel">
      <header className="film-panel-head">
        <strong>Bild {panel.panelIndex}</strong>
        <p className="muted">{panel.caption}</p>
        {panel.expressionHint ? (
          <p className="film-expression">Gesicht: {panel.expressionHint}</p>
        ) : null}
      </header>
      <div
        className="film-panel-stage"
        style={{
          backgroundImage: bg.imageUrl ? `url(${bg.imageUrl})` : undefined,
        }}
      >
        {!bg.imageUrl && <p className="film-panel-empty">Hintergrund fehlt</p>}
        {panel.placements.map((pl) => (
          <div
            key={`${pl.name}-${pl.poseId}-${pl.x}`}
            className={`film-cutout film-depth-${pl.depth}`}
            style={{
              left: `${pl.x}%`,
              transform: `translateX(-50%) scale(${pl.scale})${pl.flip ? ' scaleX(-1)' : ''}`,
            }}
          >
            {pl.imageUrl ? (
              <img src={pl.imageUrl} alt={pl.name} />
            ) : (
              <span className="film-cutout-ph">{pl.name}</span>
            )}
          </div>
        ))}
      </div>
      {panel.sketchUrl ? (
        <div className="film-sketch-wrap">
          <img src={panel.sketchUrl} alt="Skizze" className="film-sketch" />
          <p className="muted">Skizze (in der Bibliothek gespeichert)</p>
        </div>
      ) : null}
      <ul className="film-cues">
        {panel.imageCue ? <li><strong>Bild:</strong> {panel.imageCue}</li> : null}
        {panel.soundCue ? <li><strong>Ton:</strong> {panel.soundCue}</li> : null}
        {panel.speechCue ? <li><strong>Sprache:</strong> {panel.speechCue}</li> : null}
      </ul>
      <div className="film-matches">
        {panel.placements.map((pl) => (
          <p key={`${pl.name}-m-${pl.poseId}`} className={`film-match ${matchClass(pl.match)}`}>
            {pl.name} · {pl.poseHint} — {pl.matchNoteDe}
          </p>
        ))}
        <p className={`film-match ${matchClass(bg.match)}`}>{bg.matchNoteDe}</p>
      </div>
      <div className="film-tweak">
        <input
          className="input"
          value={note}
          disabled={busy}
          placeholder="z.B. Julien eher im Hintergrund"
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy || !note.trim()}
          onClick={() => onTweak(note.trim())}
        >
          Anpassen
        </button>
      </div>
      <label className="film-comment">
        <span className="muted">Kommentar zur Zeile</span>
        <textarea
          className="input"
          rows={2}
          value={comment}
          disabled={busy}
          placeholder="Notiz nur für dich …"
          onChange={(e) => setComment(e.target.value)}
          onBlur={() => {
            if (comment.trim() !== (panel.comment ?? '')) onComment(comment)
          }}
        />
      </label>
      <div className="film-tweak">
        <input
          className="input"
          value={insertText}
          disabled={busy}
          placeholder='Zeile danach: «Julien springt und ruft Juhe»'
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
          Zeile einfügen
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onSketch}>
          {panel.sketchUrl ? 'Skizze neu' : 'Skizze'}
        </button>
      </div>
    </article>
  )
}

export function FilmStoryboardPage() {
  const { id } = useParams<{ id: string }>()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [board, setBoard] = useState<FilmStoryboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [sceneTitle, setSceneTitle] = useState('')

  const load = async () => {
    if (!id) return
    const { dialog: d } = await api.dialogs.get(id)
    setDialog(d)
    setBoard(d.filmStoryboard ? normalizeFilmStoryboard(d.filmStoryboard) : null)
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : 'Fehler'))
      .finally(() => setLoading(false))
  }, [id])

  const apply = (d: Dialog, b: FilmStoryboard) => {
    setDialog(d)
    setBoard(normalizeFilmStoryboard(b))
  }

  const run = async (fn: () => Promise<{ dialog: Dialog; board: FilmStoryboard }>) => {
    setBusy(true)
    setError('')
    try {
      const result = await fn()
      apply(result.dialog, result.board)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setBusy(false)
    }
  }

  const scenes = useMemo(() => (board ? normalizeFilmStoryboard(board).scenes : []), [board])
  const missing = boardNeedsDrawing(board ?? undefined)

  if (loading) {
    return (
      <div className="page-center">
        <p className="muted">Lade Storyboard …</p>
      </div>
    )
  }

  if (!dialog || !id) {
    return (
      <div className="page-center">
        <p>Dialog nicht gefunden.</p>
        <Link to="/">Zurück</Link>
      </div>
    )
  }

  return (
    <div className="page film-board-page">
      <FilmProjectNav dialogId={dialog.id} />
      <div className="page-header">
        <div>
          <h1>Storyboard</h1>
          <p className="muted">
            {dialog.title} · Zielsprache {dialog.targetLanguage.toUpperCase()} · beliebig viele Figuren
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void run(() => api.ai.filmStoryboard(id))}
          >
            {busy ? 'Plane …' : board ? 'Ganzes Board neu' : 'Storyboard erzeugen'}
          </button>
          <Link to={`/dialog/${id}/export`} className="btn btn-story-studio">
            Film generieren
          </Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <p className="film-legend">
        <span className="film-match is-reuse">{matchLabel('reuse')}</span>
        <span className="film-match is-transform">{matchLabel('transform')}</span>
        <span className="film-match is-missing">{matchLabel('missing')}</span>
      </p>

      {board ? (
        <>
          <p className={missing ? 'alert alert-warn' : 'alert alert-info'}>
            {board.summaryDe}
            {missing > 0 ? (
              <>
                {' '}
                Fehlendes in der <Link to={`/library?dialog=${dialog.id}`}>Bibliothek</Link> zeichnen.
              </>
            ) : null}
          </p>

          <div className="film-scene-toolbar">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || picked.length === 0}
              onClick={() => void run(() => api.ai.filmStoryboardRegenerate(id, picked))}
            >
              Gewählte Szene(n) anpassen
            </button>
            <input
              className="input"
              value={sceneTitle}
              placeholder="Neue Szene (Titel)"
              onChange={(e) => setSceneTitle(e.target.value)}
              disabled={busy}
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  api.ai.filmInsertScene(id, scenes.at(-1)?.id ?? null, sceneTitle.trim() || 'Neue Szene'),
                )
              }
            >
              Szene einfügen
            </button>
          </div>

          {scenes.map((scene) => {
            const panels = board.panels.filter((p) => p.sceneId === scene.id)
            const checked = picked.includes(scene.id)
            return (
              <section key={scene.id} className="film-scene">
                <header className="film-scene-head">
                  <label className="film-scene-pick">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setPicked((prev) =>
                          checked ? prev.filter((x) => x !== scene.id) : [...prev, scene.id],
                        )
                      }
                    />
                    <h2>{scene.title}</h2>
                  </label>
                </header>
                <textarea
                  className="input"
                  rows={2}
                  defaultValue={scene.noteDe}
                  placeholder="Zur ganzen Szene: Ort, Stimmung, wer dabei ist …"
                  disabled={busy}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== (scene.noteDe ?? '')) {
                      void run(() => api.ai.filmSceneNote(id, scene.id, e.target.value))
                    }
                  }}
                />
                <div className="film-panel-grid">
                  {panels.map((panel) => (
                    <PanelCard
                      key={panel.id}
                      panel={panel}
                      busy={busy}
                      onTweak={(note) => void run(() => api.ai.filmStoryboardTweak(id, panel.id, note))}
                      onComment={(comment) =>
                        void run(() => api.ai.filmStoryboardComment(id, panel.id, comment))
                      }
                      onInsert={(text) => void run(() => api.ai.filmInsertPanel(id, panel.id, text))}
                      onSketch={() => void run(() => api.ai.filmSketch(id, panel.id))}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </>
      ) : (
        <div className="empty-state">
          <h2>Noch kein Storyboard</h2>
          <p>
            Aus deinem Film-Prompt entstehen Kästen. Vorhandene Figuren werden genommen. Skizzen nur auf Knopf —
            sonst sparst du Token.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void run(() => api.ai.filmStoryboard(id))}
          >
            {busy ? 'Plane …' : 'Storyboard erzeugen'}
          </button>
        </div>
      )}
    </div>
  )
}
