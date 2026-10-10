import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { FilmProjectNav } from './FilmProjectNav'
import {
  FilmBeatColumns,
  FilmBeatNotes,
  FilmSceneGenerateBar,
  FilmStillFixBar,
} from './FilmSceneGenerate'
import { FilmScenePreviewPlayer } from './FilmScenePreview'
import { FilmStillPicture } from './FilmStillArrange'
import { useSceneStills } from './generateSceneStills'
import type { Dialog } from '../types'
import type { FilmStoryboard, FilmStoryboardPanel } from '../../shared/film-storyboard'
import {
  boardNeedsDrawing,
  normalizeFilmStoryboard,
  panelDialogueLines,
} from '../../shared/film-storyboard'
import { DEFAULT_STORY_ART_STYLE } from '../../shared/story-art-styles'

function matchClass(kind: string) {
  if (kind === 'reuse') return 'is-reuse'
  if (kind === 'transform') return 'is-transform'
  return 'is-missing'
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
  onLayout,
}: {
  panel: FilmStoryboardPanel
  dialog: Dialog
  busy: boolean
  onTweak: (note: string) => void
  onComment: (comment: string) => void
  onInsert: (text: string) => void
  onCorrect: (note: string) => void
  onSketch: () => void
  onLayout: (dialog: Dialog, board: FilmStoryboard) => void
}) {
  const [note, setNote] = useState(panel.directorNote ?? '')
  const [comment, setComment] = useState(panel.comment ?? '')
  const bg = panel.background

  return (
    <article className="film-panel">
      <FilmBeatColumns
        picture={
          panel.stillUrl || panel.background.imageUrl ? (
            <FilmStillPicture
              dialogId={dialog.id}
              panel={panel}
              interactive={false}
              onUpdated={onLayout}
            />
          ) : (
            <div
              className="film-panel-stage"
              style={{
                backgroundImage: bg.imageUrl ? `url(${bg.imageUrl})` : undefined,
              }}
            >
              {!bg.imageUrl && <p className="film-panel-empty">Noch kein Bild</p>}
            </div>
          )
        }
        lines={panelDialogueLines(panel, dialog)}
        fallback={panel.caption}
        targetLanguage={dialog.targetLanguage}
        sourceLanguage={dialog.sourceLanguage}
        notes={
          <>
            <p className="film-beat-count">Bild {panel.panelIndex}</p>
            <FilmBeatNotes panel={panel} dialog={dialog} />
            <div className="film-matches">
              {panel.placements.map((pl) => (
                <span
                  key={`${pl.name}-m-${pl.poseId}`}
                  className={`film-match ${matchClass(pl.match)}`}
                  title={pl.matchNoteDe}
                >
                  {pl.name}
                </span>
              ))}
              <span className={`film-match ${matchClass(bg.match)}`} title={bg.matchNoteDe}>
                Raum
              </span>
            </div>
          </>
        }
      />
      <details className="film-panel-more">
        <summary>Bild ändern</summary>
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
      </details>
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
          <h1>Bilder</h1>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={locked}
            onClick={() => void run(() => api.ai.filmStoryboard(id))}
            title={board ? 'Ganzes Board neu' : 'Storyboard erzeugen'}
          >
            {busy ? '…' : board ? 'Neu planen' : 'Planen'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {board ? (
        <>
          {missing > 0 ? (
            <p className="alert alert-warn">
              {missing} Teil{missing === 1 ? '' : 'e'} fehlen.
            </p>
          ) : null}

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
                  onRematch={() => void run(() => api.ai.filmLibraryRematch(id))}
                />
                <div className="film-panel-grid">
                  {panels.map((panel) => (
                    <PanelCard
                      key={panel.id}
                      panel={panel}
                      dialog={dialog}
                      busy={locked}
                      onLayout={apply}
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
          <h2>Noch kein Bildplan</h2>
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
