import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { FilmProjectNav } from './FilmProjectNav'
import { FilmSceneGenerateBar, FilmStillStrip } from './FilmSceneGenerate'
import { useSceneStills } from './generateSceneStills'
import { LanguageFlag } from '../components/LanguageFlag'
import type { Dialog } from '../types'
import { LANGUAGES } from '../types'
import { DEFAULT_STORY_ART_STYLE } from '../../shared/story-art-styles'
import {
  normalizeFilmStoryboard,
  type FilmPlan,
  type FilmStoryboard,
} from '../../shared/film-storyboard'

export function FilmExportPage() {
  const { id } = useParams<{ id: string }>()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [lang, setLang] = useState('de')
  const [styles, setStyles] = useState<Record<string, string>>({})
  const [at, setAt] = useState('')
  const [note, setNote] = useState('')
  const [timeline, setTimeline] = useState<FilmPlan['timelineNotes']>([])

  const applyBoard = (d: Dialog, _b: FilmStoryboard) => {
    setDialog(d)
  }

  const stills = useSceneStills(id, applyBoard)

  useEffect(() => {
    if (!id) return
    api.dialogs
      .get(id)
      .then(({ dialog: d }) => {
        setDialog(d)
        setLang(d.targetLanguage)
        const board = d.filmStoryboard ? normalizeFilmStoryboard(d.filmStoryboard) : null
        const fromPlan = d.filmPlan
        const next: Record<string, string> = {}
        for (const scene of board?.scenes ?? []) {
          next[scene.id] =
            fromPlan?.scenes.find((s) => s.sceneId === scene.id)?.styleId ?? DEFAULT_STORY_ART_STYLE
        }
        setStyles(next)
        setTimeline(fromPlan?.timelineNotes ?? [])
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Fehler'))
      .finally(() => setLoading(false))
  }, [id])

  const board = useMemo(
    () => (dialog?.filmStoryboard ? normalizeFilmStoryboard(dialog.filmStoryboard) : null),
    [dialog],
  )

  const buildPlan = (extra?: Partial<FilmPlan>): FilmPlan => ({
    version: 1,
    targetLanguage: lang,
    scenes: (board?.scenes ?? []).map((s) => ({
      sceneId: s.id,
      styleId: styles[s.id] ?? DEFAULT_STORY_ART_STYLE,
    })),
    timelineNotes: extra?.timelineNotes ?? timeline,
    updatedAt: new Date().toISOString(),
    ...extra,
  })

  const savePlan = async (extra?: Partial<FilmPlan>) => {
    if (!id || !dialog) return
    const plan = buildPlan(extra)
    setBusy(true)
    setError('')
    try {
      const { dialog: d } = await api.ai.filmPlanSave(id, plan)
      setDialog(d)
      if (d.targetLanguage !== lang) {
        const translated = await api.dialogs.update(id, { targetLanguage: lang })
        setDialog(translated.dialog)
      }
      setStatus('Stil und Sprache gespeichert.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const generateScene = async (sceneId: string, force: boolean) => {
    if (!id || !board) return
    const panels = board.panels.filter((p) => p.sceneId === sceneId)
    const styleId = styles[sceneId] ?? DEFAULT_STORY_ART_STYLE
    setError('')
    setStatus('')
    try {
      await api.ai.filmPlanSave(id, buildPlan())
    } catch {
      /* Stil wird beim Bild trotzdem mitgeschickt */
    }
    await stills.generate(sceneId, panels, styleId, force)
  }

  if (loading) return <p className="muted" style={{ padding: '2rem' }}>Laden …</p>
  if (!dialog) {
    return (
      <div className="page-center">
        <p>Dialog nicht gefunden.</p>
        <Link to="/">Zurück</Link>
      </div>
    )
  }

  return (
    <div className="page film-export-page">
      <FilmProjectNav dialogId={dialog.id} />
      <div className="page-header">
        <div>
          <h1>Film generieren</h1>
          <p className="muted">
            Hier machst du die <strong>Standbilder Szene für Szene</strong> — damit du siehst, ob
            es gut herauskommt. Der bewegte Film (sprechen, blinzeln) kommt später, sonst wird es
            teuer.
          </p>
        </div>
        {board ? (
          <Link to={`/dialog/${dialog.id}/board`} className="btn btn-secondary">
            Zum Storyboard
          </Link>
        ) : null}
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {status && <div className="alert alert-info">{status}</div>}

      {!board ? (
        <p>
          Zuerst ein <Link to={`/dialog/${dialog.id}/board`}>Storyboard</Link> bauen. Danach kannst
          du hier Szene 1, dann Szene 2 als Bilder erzeugen.
        </p>
      ) : (
        <>
          <label className="dialog-meta-block">
            <span className="dialog-meta-label">Zielsprache des Films</span>
            <span className="lang-select-row">
              <LanguageFlag code={lang} size="md" />
              <select value={lang} onChange={(e) => setLang(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            </span>
          </label>

          {board.scenes.map((scene) => {
            const panels = board.panels.filter((p) => p.sceneId === scene.id)
            const sceneBusy = stills.busySceneId === scene.id
            return (
              <section key={scene.id} className="film-scene">
                <h2>{scene.title}</h2>
                <p className="muted">{scene.noteDe || 'Keine Szenennotiz'}</p>
                <FilmStillStrip panels={panels} />
                <FilmSceneGenerateBar
                  dialogId={dialog.id}
                  scene={scene}
                  panels={panels}
                  styleId={styles[scene.id] ?? DEFAULT_STORY_ART_STYLE}
                  onStyleChange={(next) => setStyles((prev) => ({ ...prev, [scene.id]: next }))}
                  busy={sceneBusy}
                  extraDisabled={(stills.busySceneId !== null && !sceneBusy) || busy}
                  progress={
                    stills.progress?.sceneId === scene.id
                      ? { current: stills.progress.current, total: stills.progress.total }
                      : null
                  }
                  error={stills.errors[scene.id]}
                  onGenerate={(force) => void generateScene(scene.id, force)}
                />
              </section>
            )
          })}

          <h2>Änderungen in der Zeit</h2>
          <p className="muted">
            Später mit Abspiel-Leiste. Jetzt schon notieren: z.B. bei 12:23 Tara etwas lauter schreien.
          </p>
          <ul className="film-timeline">
            {timeline.map((t) => (
              <li key={t.id}>
                <strong>{t.at}</strong> — {t.note}
              </li>
            ))}
          </ul>
          <div className="film-tweak">
            <input
              className="input"
              value={at}
              placeholder="12:23"
              onChange={(e) => setAt(e.target.value)}
            />
            <input
              className="input"
              value={note}
              placeholder="Tara etwas lauter schreien lassen"
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!at.trim() || !note.trim()}
              onClick={() => {
                setTimeline((prev) => [
                  ...prev,
                  { id: `tl-${Date.now()}`, at: at.trim(), note: note.trim() },
                ])
                setAt('')
                setNote('')
              }}
            >
              Merken
            </button>
          </div>

          <div className="button-row" style={{ marginTop: '1.25rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || stills.busySceneId !== null}
              onClick={() => void savePlan()}
            >
              {busy ? '…' : 'Stil und Sprache speichern'}
            </button>
          </div>
          <p className="muted">
            Die eigentlichen Film-Sekunden (sprechen, blinzeln, Bewegung) kommen erst, wenn die
            Standbilder stimmen — sonst wird es teuer.
          </p>
        </>
      )}
    </div>
  )
}
