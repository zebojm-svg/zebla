import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { FilmProjectNav } from './FilmProjectNav'
import type { Dialog } from '../types'
import type { FilmStoryboard, FilmStoryboardPanel } from '../../shared/film-storyboard'
import { boardNeedsDrawing } from '../../shared/film-storyboard'

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
}: {
  panel: FilmStoryboardPanel
  busy: boolean
  onTweak: (note: string) => void
}) {
  const [note, setNote] = useState(panel.directorNote ?? '')
  const bg = panel.background

  return (
    <article className="film-panel">
      <header className="film-panel-head">
        <strong>
          Szene {panel.sceneIndex + 1} · Bild {panel.panelIndex}
        </strong>
        <p className="muted">{panel.caption}</p>
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
            key={`${pl.name}-${pl.poseId}`}
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
      <ul className="film-cues">
        {panel.imageCue ? <li><strong>Bild:</strong> {panel.imageCue}</li> : null}
        {panel.soundCue ? <li><strong>Ton:</strong> {panel.soundCue}</li> : null}
        {panel.speechCue ? <li><strong>Sprache:</strong> {panel.speechCue}</li> : null}
      </ul>
      <div className="film-matches">
        {panel.placements.map((pl) => (
          <p key={`${pl.name}-m`} className={`film-match ${matchClass(pl.match)}`}>
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

  const load = async () => {
    if (!id) return
    const { dialog: d } = await api.dialogs.get(id)
    setDialog(d)
    setBoard(d.filmStoryboard ?? null)
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : 'Fehler'))
      .finally(() => setLoading(false))
  }, [id])

  const plan = async () => {
    if (!id) return
    setBusy(true)
    setError('')
    try {
      const result = await api.ai.filmStoryboard(id)
      setDialog(result.dialog)
      setBoard(result.board)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Storyboard fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const tweak = async (panelId: string, note: string) => {
    if (!id) return
    setBusy(true)
    setError('')
    try {
      const result = await api.ai.filmStoryboardTweak(id, panelId, note)
      setDialog(result.dialog)
      setBoard(result.board)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anpassen fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="page-center">
        <p className="muted">Lade Storyboard …</p>
      </div>
    )
  }

  if (!dialog) {
    return (
      <div className="page-center">
        <p>Dialog nicht gefunden.</p>
        <Link to="/">Zurück</Link>
      </div>
    )
  }

  const missing = boardNeedsDrawing(board ?? undefined)

  return (
    <div className="page film-board-page">
      <FilmProjectNav dialogId={dialog.id} />
      <div className="page-header">
        <div>
          <h1>Storyboard</h1>
          <p className="muted">{dialog.title}</p>
        </div>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void plan()}>
          {busy ? 'Plane …' : board ? 'Storyboard neu bauen' : 'Ins Storyboard'}
        </button>
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
                Fehlendes einmal in der <Link to={`/library?dialog=${dialog.id}`}>Bibliothek</Link> zeichnen
                — nächster Film wird billiger.
              </>
            ) : null}
          </p>
          <div className="film-panel-grid">
            {board.panels.map((panel) => (
              <PanelCard
                key={panel.id}
                panel={panel}
                busy={busy}
                onTweak={(note) => void tweak(panel.id, note)}
              />
            ))}
          </div>
          <p className="muted">
            Export (einzelne Szene oder ganzer Film) kommt als Nächstes. Sprechen und Blinzeln erst auf dem
            fertigen Standbild.
          </p>
        </>
      ) : (
        <div className="empty-state">
          <h2>Noch kein Storyboard</h2>
          <p>
            Die KI macht grobe Kästen aus dem Dialog — wenig Token, keine teuren Bilder. Vorhandene Julien-Posen
            und Hintergründe werden zuerst genommen.
          </p>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void plan()}>
            {busy ? 'Plane …' : 'Storyboard erzeugen'}
          </button>
        </div>
      )}
    </div>
  )
}
