import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { FilmProjectNav } from './FilmProjectNav'
import {
  FilmBeatColumns,
  FilmBeatNotes,
  FilmCueFields,
  FilmSceneGenerateBar,
  FilmStillFixBar,
} from './FilmSceneGenerate'
import { FilmCastVoices } from './FilmCastVoices'
import { FilmScenePreviewPlayer } from './FilmScenePreview'
import { FilmStillPicture } from './FilmStillArrange'
import { useSceneStills } from './generateSceneStills'
import type { Dialog } from '../types'
import type { FilmStoryboard, FilmStoryboardPanel } from '../../shared/film-storyboard'
import {
  boardNeedsDrawing,
  dialogNeedsNativeFill,
  dialogNeedsNativeTranslation,
  dialogNeedsTargetTranslation,
  expectedSceneShotCount,
  boardFollowsDialog,
  filmScenesFromDialog,
  normalizeFilmStoryboard,
  panelDialogueLines,
  panelsForDialogScene,
  repeatedDialogSectionTitles,
  sceneShotPlanDe,
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
  sceneTitle,
  scenePanels,
  busy,
  painting,
  onComment,
  onInsert,
  onCorrect,
  onCues,
  onRewrite,
  onSketch,
  onLayout,
}: {
  panel: FilmStoryboardPanel
  dialog: Dialog
  sceneTitle: string
  scenePanels: FilmStoryboardPanel[]
  busy: boolean
  painting?: boolean
  onComment: (comment: string) => void
  onInsert: (text: string) => void
  onCorrect: (note: string) => void
  onCues: (cues: { soundCue?: string; imageCue?: string; speechCue?: string }) => void
  onRewrite: (lineId: string, nativeText: string) => Promise<void>
  onSketch: () => void
  onLayout: (dialog: Dialog, board: FilmStoryboard) => void
}) {
  const [comment, setComment] = useState(panel.comment ?? '')
  const [nativeBusy, setNativeBusy] = useState(false)
  const bg = panel.background

  useEffect(() => {
    setComment(panel.comment ?? '')
  }, [panel.id, panel.comment])

  const confirmNative = async (lineId: string, nativeText: string) => {
    setNativeBusy(true)
    try {
      await onRewrite(lineId, nativeText)
    } catch {
      /* Fehler steht oben auf der Seite */
    } finally {
      setNativeBusy(false)
    }
  }

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
        underPicture={
          <>
            {painting ? (
              <p className="film-panel-painting" aria-live="polite">
                Bild wird neu gemalt … das dauert etwa eine Minute.
              </p>
            ) : null}
            <FilmStillFixBar panel={panel} busy={busy} onCorrect={onCorrect} />
            <p className="muted film-tweak-hint">Kurzer Hinweis reicht.</p>
          </>
        }
        lines={panelDialogueLines(panel, dialog, scenePanels, sceneTitle)}
        targetLanguage={dialog.targetLanguage}
        sourceLanguage={dialog.sourceLanguage}
        nativeBusy={nativeBusy}
        onConfirmNative={(lineId, nativeText) => void confirmNative(lineId, nativeText)}
        notes={
          <>
            <p className="film-beat-count">
              Bild {panel.panelIndex}
              {painting ? <span> · wird neu gemalt …</span> : null}
            </p>
            <FilmBeatNotes panel={panel} dialog={dialog} hideCues />
            <FilmCueFields panel={panel} busy={busy} onSave={onCues} />
            <FilmStillFixBar panel={panel} busy={busy} onInsert={onInsert} />
            <div className="film-tweak">
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onSketch}>
                {panel.sketchUrl ? 'Skizze neu' : 'Skizze'}
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
  const [nativeBusy, setNativeBusy] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
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
  const locked = busy || nativeBusy || stills.busySceneId !== null
  const needsGerman = dialog ? dialogNeedsNativeTranslation(dialog) : false
  const needsNativeFill = dialog ? dialogNeedsNativeFill(dialog) : false
  const needsTarget = dialog ? dialogNeedsTargetTranslation(dialog) : false

  const run = async (fn: () => Promise<{ dialog: Dialog; board: FilmStoryboard }>) => {
    setBusy(true)
    setError('')
    try {
      const result = await fn()
      apply(result.dialog, result.board)
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
      return null
    } finally {
      setBusy(false)
    }
  }

  const fetchGerman = async () => {
    if (!id || !dialog) return
    setNativeBusy(true)
    setError('')
    try {
      const { dialog: next } = await api.ai.birkenbihl(id, dialog.sourceLanguage || 'de')
      setDialog(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Übersetzung fehlgeschlagen.')
    } finally {
      setNativeBusy(false)
    }
  }

  const makeTarget = async () => {
    if (!id || !dialog) return
    setNativeBusy(true)
    setError('')
    try {
      const { dialog: next } = await api.ai.translate(id, dialog.targetLanguage, true, true)
      setDialog(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zielsprache fehlgeschlagen.')
    } finally {
      setNativeBusy(false)
    }
  }

  const scenes = useMemo(
    () => (board && dialog ? filmScenesFromDialog(dialog, board) : []),
    [board, dialog],
  )
  const boardFitsDialog = Boolean(board && dialog && boardFollowsDialog(board, dialog))
  const missing = boardFitsDialog ? boardNeedsDrawing(board ?? undefined) : 0
  const repeatedTitles = dialog ? repeatedDialogSectionTitles(dialog) : []

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
            onClick={() => {
              if (board) {
                const ok = window.confirm(
                  'Alte Bilder und den Bildplan löschen und nur aus dem Dialog neu bauen? Pro Dialogzeile entsteht ein Bild — gleiche Bilder werden wiederverwendet, bis du etwas änderst. Danach wird die erste Szene gemalt.',
                )
                if (!ok) return
                void (async () => {
                  const result = await run(() => api.ai.filmStoryboardReset(id))
                  if (!result || !id) return
                  const nextBoard = normalizeFilmStoryboard(result.board)
                  const first = nextBoard.scenes[0]
                  if (!first) return
                  const panels = nextBoard.panels.filter((p) => p.sceneId === first.id)
                  if (panels.length === 0) return
                  await stills.generate(
                    first.id,
                    panels,
                    DEFAULT_STORY_ART_STYLE,
                    false,
                  )
                })()
                return
              }
              void run(() => api.ai.filmStoryboard(id))
            }}
            title={board ? 'Alte Bilder löschen, vom Dialog neu' : 'Storyboard aus dem Dialog'}
          >
            {busy ? '…' : board ? 'Vom Text neu' : 'Planen'}
          </button>
          {needsTarget ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={locked}
              onClick={() => void makeTarget()}
              title="Zielsprache aus dem deutschen Dialog schreiben"
            >
              {nativeBusy ? '…' : 'Zielsprache machen'}
            </button>
          ) : null}
          {needsNativeFill ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={locked}
              onClick={() => void fetchGerman()}
              title="Deutsches und Birkenbihl aus der Zielsprache schreiben — Bilder bleiben"
            >
              {nativeBusy ? '…' : 'Deutsch unter die Zeilen'}
            </button>
          ) : null}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {dialog && needsTarget ? (
        <p className="alert alert-warn">
          Der Dialog ist auf Deutsch. Oben «Zielsprache machen» drücken — erst dann spricht die
          Stimme die Lernsprache.
        </p>
      ) : null}
      {dialog && needsNativeFill ? (
        <p className="alert alert-warn">
          {needsGerman
            ? 'Deutsch fehlt noch. «Deutsch unter die Zeilen» schreibt Deutsch (ganze Sätze) und Birkenbihl aus der Zielsprache — die Bilder bleiben.'
            : 'Birkenbihl fehlt noch. «Deutsch unter die Zeilen» füllt es aus der Zielsprache — die Bilder bleiben.'}
        </p>
      ) : null}
      {repeatedTitles.length > 0 ? (
        <p className="alert alert-warn">
          {repeatedTitles.join(', ')} {repeatedTitles.length === 1 ? 'hat' : 'haben'} denselben
          Dialog wie eine frühere Szene. Unter Text «Dialog daraus machen» drücken — Szenen
          entstehen dort, nicht auf den Bildern.
        </p>
      ) : null}
      {board && dialog && !boardFitsDialog ? (
        <p className="alert alert-warn">
          Der Dialog ist neu — die alten Bilder passen nicht mehr. Oben «Vom Text neu» drücken,
          dann entstehen die Bilder zur neuen Regie (Nahaufnahme, Zwischenbild).
        </p>
      ) : null}

      {board ? (
        <>
          {missing > 0 ? (
            <p className="alert alert-warn">
              {missing} Teil{missing === 1 ? '' : 'e'} fehlen.
            </p>
          ) : null}

          <FilmCastVoices
            dialog={dialog}
            disabled={locked}
            onDialogUpdated={setDialog}
          />

          <details className="film-board-tools">
            <summary>Szenen anpassen</summary>
            <p className="muted film-board-scene-hint">
              Szenen kommen aus dem Text (Dialog daraus machen), nicht von hier. Hier nur Bilder
              neu planen.
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
            </div>
          </details>

          {scenes.map((scene) => {
            const panels = panelsForDialogScene(board, dialog, scene.id)
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
                {panels.length === 0 ? (
                  <p className="muted">Noch keine Bilder für diese Szene. Oben «Vom Text neu».</p>
                ) : null}
                <FilmScenePreviewPlayer
                  dialogId={dialog.id}
                  dialog={dialog}
                  scene={scene}
                  panels={panels}
                  onDialogUpdated={setDialog}
                />
                <details className="film-scene-more">
                  <summary>Bilder erzeugen</summary>
                  <textarea
                    className="input"
                    rows={2}
                    defaultValue={scene.noteDe}
                    placeholder="Zur ganzen Szene: Ort, wer dabei ist …"
                    disabled={locked}
                    onBlur={(e) => {
                      if (e.target.value.trim() !== (scene.noteDe ?? '')) {
                        void run(() => api.ai.filmSceneNote(id, scene.id, e.target.value))
                      }
                    }}
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
                    shotPlanDe={sceneShotPlanDe(panels)}
                    expectedShots={expectedSceneShotCount(dialog, scene.id)}
                  />
                </details>
                <div className="film-panel-grid">
                  {panels.map((panel) => (
                    <PanelCard
                      key={panel.id}
                      panel={panel}
                      dialog={dialog}
                      sceneTitle={scene.title}
                      scenePanels={panels}
                      busy={locked}
                      onLayout={apply}
                      painting={stills.busyPanelId === panel.id}
                      onComment={(comment) =>
                        void run(() => api.ai.filmStoryboardComment(id, panel.id, comment))
                      }
                      onCues={(cues) =>
                        void run(() => api.ai.filmStoryboardCues(id, panel.id, cues))
                      }
                      onRewrite={async (lineId, nativeText) => {
                        setError('')
                        try {
                          const { dialog: next } = await api.ai.rewriteLine(id, lineId, nativeText)
                          setDialog(next)
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Text konnte nicht angepasst werden.')
                          throw err
                        }
                      }}
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
