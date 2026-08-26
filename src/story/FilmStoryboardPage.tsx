import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { FilmProjectNav } from './FilmProjectNav'
import { FilmPanelDialogue, FilmSceneGenerateBar, FilmStillFixBar } from './FilmSceneGenerate'
import { FilmScenePreviewPlayer } from './FilmScenePreview'
import { useSceneStills } from './generateSceneStills'
import type { Dialog } from '../types'
import type { FilmStoryboard, FilmStoryboardPanel } from '../../shared/film-storyboard'
import {
  boardNeedsDrawing,
  normalizeFilmStoryboard,
} from '../../shared/film-storyboard'
import { DEFAULT_STORY_ART_STYLE } from '../../shared/story-art-styles'

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
  dialog,
  busy,
  onTweak,
  onComment,
  onInsert,
  onCorrect,
  onSketch,
}: {
  panel: FilmStoryboardPanel
  dialog: Dialog
  busy: boolean
  onTweak: (note: string) => void
  onComment: (comment: string) => void
  onInsert: (text: string) => void
  onCorrect: (note: string) => void
  onSketch: () => void
}) {
  const [note, setNote] = useState(panel.directorNote ?? '')
  const [comment, setComment] = useState(panel.comment ?? '')
  const bg = panel.background

  return (
    <article className="film-panel">
      <header className="film-panel-head">
        <strong>Bild {panel.panelIndex}</strong>
        {panel.expressionHint ? (
          <p className="film-expression">Gesicht: {panel.expressionHint}</p>
        ) : null}
      </header>
      {panel.stillUrl ? (
        <div className="film-panel-still">
          <img src={panel.stillUrl} alt={panel.caption} />
          <p className="muted">Standbild dieser Zeile</p>
          {panel.harvestNoteDe ? (
            <p className="alert alert-info film-harvest-note">{panel.harvestNoteDe}</p>
          ) : null}
          <FilmPanelDialogue panel={panel} dialog={dialog} />
        </div>
      ) : (
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
      )}
      {!panel.stillUrl ? <FilmPanelDialogue panel={panel} dialog={dialog} /> : null}
      {panel.sketchUrl ? (
        <div className="film-sketch-wrap">
          <img src={panel.sketchUrl} alt="Skizze" className="film-sketch" />
          <p className="muted">Skizze (in der Bibliothek gespeichert)</p>
        </div>
      ) : null}
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
      <FilmStillFixBar
        panel={panel}
        busy={busy}
        onCorrect={onCorrect}
        onInsert={onInsert}
      />
      <div className="film-tweak">
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
  const [styles, setStyles] = useState<Record<string, string>>({})

  const load = async () => {
    if (!id) return
    const { dialog: d } = await api.dialogs.get(id)
    setDialog(d)
    const nextBoard = d.filmStoryboard ? normalizeFilmStoryboard(d.filmStoryboard) : null
    setBoard(nextBoard)
    if (nextBoard) {
      const fromPlan = d.filmPlan
      const next: Record<string, string> = {}
      for (const scene of nextBoard.scenes) {
        next[scene.id] =
          fromPlan?.scenes.find((s) => s.sceneId === scene.id)?.styleId ?? DEFAULT_STORY_ART_STYLE
      }
      setStyles(next)
    }
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : 'Fehler'))
      .finally(() => setLoading(false))
  }, [id])

  const apply = (d: Dialog, b: FilmStoryboard) => {
    setDialog(d)
    setBoard(normalizeFilmStoryboard(b))
    const fromPlan = d.filmPlan
    setStyles((prev) => {
      const next = { ...prev }
      for (const scene of normalizeFilmStoryboard(b).scenes) {
        if (!next[scene.id]) {
          next[scene.id] =
            fromPlan?.scenes.find((s) => s.sceneId === scene.id)?.styleId ?? DEFAULT_STORY_ART_STYLE
        }
      }
      return next
    })
  }

  const stills = useSceneStills(id, apply)
  const locked = busy || stills.busySceneId !== null

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
          <p className="muted">
            Pro Szene «Diese Szene erzeugen» — das macht die Standbilder. Unter jedem Bild steht
            der Dialog. «Szene abspielen» ist Standbilder plus Stimme, noch kein Bewegungsfilm.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={locked}
            onClick={() => void run(() => api.ai.filmStoryboard(id))}
          >
            {busy ? 'Plane …' : board ? 'Ganzes Board neu' : 'Storyboard erzeugen'}
          </button>
          <Link to={`/dialog/${id}/export`} className="btn btn-story-studio">
            Zum Film — Szene erzeugen
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
              disabled={busy || picked.length === 0 || locked}
              onClick={() => void run(() => api.ai.filmStoryboardRegenerate(id, picked))}
            >
              Gewählte Szene(n) anpassen
            </button>
            <input
              className="input"
              value={sceneTitle}
              placeholder="Neue Szene (Titel)"
              onChange={(e) => setSceneTitle(e.target.value)}
              disabled={locked}
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={locked}
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
                  disabled={locked}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== (scene.noteDe ?? '')) {
                      void run(() => api.ai.filmSceneNote(id, scene.id, e.target.value))
                    }
                  }}
                />
                <FilmScenePreviewPlayer
                  dialogId={dialog.id}
                  dialog={dialog}
                  scene={scene}
                  panels={panels}
                  onDialogUpdated={setDialog}
                />
                <FilmSceneGenerateBar
                  dialogId={dialog.id}
                  scene={scene}
                  panels={panels}
                  styleId={styles[scene.id] ?? DEFAULT_STORY_ART_STYLE}
                  onStyleChange={(next) => setStyles((prev) => ({ ...prev, [scene.id]: next }))}
                  busy={stills.busySceneId === scene.id}
                  extraDisabled={locked && stills.busySceneId !== scene.id}
                  progress={
                    stills.progress?.sceneId === scene.id
                      ? { current: stills.progress.current, total: stills.progress.total }
                      : null
                  }
                  error={stills.errors[scene.id]}
                  onGenerate={(force) =>
                    void stills.generate(
                      scene.id,
                      panels,
                      styles[scene.id] ?? DEFAULT_STORY_ART_STYLE,
                      force,
                    )
                  }
                />
                <div className="film-panel-grid">
                  {panels.map((panel) => (
                    <PanelCard
                      key={panel.id}
                      panel={panel}
                      dialog={dialog}
                      busy={locked}
                      onTweak={(note) => void run(() => api.ai.filmStoryboardTweak(id, panel.id, note))}
                      onComment={(comment) =>
                        void run(() => api.ai.filmStoryboardComment(id, panel.id, comment))
                      }
                      onCorrect={(note) =>
                        void stills.generateOne(
                          scene.id,
                          panel,
                          styles[scene.id] ?? DEFAULT_STORY_ART_STYLE,
                          note,
                        )
                      }
                      onInsert={(text) =>
                        void (async () => {
                          setBusy(true)
                          setError('')
                          try {
                            const result = await api.ai.filmInsertPanel(id, panel.id, text)
                            apply(result.dialog, result.board)
                            const at = result.board.panels.findIndex((p) => p.id === panel.id)
                            const created = at >= 0 ? result.board.panels[at + 1] : undefined
                            if (created) {
                              await stills.generateOne(
                                scene.id,
                                created,
                                styles[scene.id] ?? DEFAULT_STORY_ART_STYLE,
                              )
                            }
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Fehler')
                          } finally {
                            setBusy(false)
                          }
                        })()
                      }
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
          <p className="muted">
            Aus deinem Film-Prompt entstehen Kästen. Vorhandene Figuren werden genommen. Danach pro
            Szene die Standbilder erzeugen.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={locked}
            onClick={() => void run(() => api.ai.filmStoryboard(id))}
          >
            {busy ? 'Plane …' : 'Storyboard erzeugen'}
          </button>
        </div>
      )}
    </div>
  )
}
