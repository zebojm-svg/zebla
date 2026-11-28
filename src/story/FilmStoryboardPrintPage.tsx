import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { FilmBeatText, FilmStillHistory, FilmStillMehrCompact } from './FilmSceneGenerate'
import { stillPackNumber } from '../../shared/film-still-pack'
import {
  filmScenesFromDialog,
  normalizeFilmStoryboard,
  panelDialogueLines,
  panelsForDialogScene,
} from '../../shared/film-storyboard'
import type { Dialog } from '../types'
import type { FilmStoryboard, FilmStoryboardPanel } from '../../shared/film-storyboard'
import { estimatePrintPagesDe } from '../../shared/film-print'
import { displayFilmTitle } from '../../shared/film-draft'

const VERBOSE_KEY = 'zebla-print-verbose'

function packIsSilent(
  lines: ReturnType<typeof panelDialogueLines>,
  panel: FilmStoryboardPanel,
): boolean {
  const line = lines[0]
  if (!line) return !panel.closeupSpeaker
  return line.kind === 'action' || !line.speaker?.trim() || line.speaker === 'Handlung'
}

function sceneFilterFromParams(params: URLSearchParams): string {
  return params.get('szene')?.trim() || params.get('scene')?.trim() || ''
}

export function FilmStoryboardPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const sceneFilter = sceneFilterFromParams(params)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [board, setBoard] = useState<FilmStoryboard | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [verbose, setVerbose] = useState(() => {
    try {
      return localStorage.getItem(VERBOSE_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (!id) return
    api.dialogs
      .get(id)
      .then(({ dialog: d }) => {
        setDialog(d)
        setBoard(d.filmStoryboard ? normalizeFilmStoryboard(d.filmStoryboard) : null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Fehler'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    try {
      localStorage.setItem(VERBOSE_KEY, verbose ? '1' : '0')
    } catch {
      /* kein Speicher */
    }
  }, [verbose])

  useEffect(() => {
    document.body.classList.add('film-body-print')
    return () => document.body.classList.remove('film-body-print')
  }, [])

  const scenes = useMemo(
    () => (board && dialog ? filmScenesFromDialog(dialog, board) : []),
    [board, dialog],
  )

  const chosen = sceneFilter
    ? scenes.filter((scene) => scene.id === sceneFilter || scene.title === sceneFilter)
    : scenes

  if (loading) {
    return (
      <div className="page-center">
        <p className="muted">Lade Druckansicht …</p>
      </div>
    )
  }

  if (!dialog || !board || !id) {
    return (
      <div className="page-center">
        <p>{error || 'Kein Storyboard.'}</p>
        <Link to={id ? `/dialog/${id}/board` : '/'}>Zurück zu Bilder</Link>
      </div>
    )
  }

  const title = displayFilmTitle(dialog.title)

  return (
    <div className={`page film-print-page${verbose ? ' is-verbose' : ' is-compact'}`}>
      <header className="film-print-toolbar no-print">
        <h1 className="film-print-title">Druckansicht — {title}</h1>
        <p className="muted">
          {sceneFilter
            ? `Nur Szene: ${chosen[0]?.title ?? sceneFilter}`
            : `Alle ${chosen.length} Szenen.`}
        </p>
        {chosen.map((scene) => {
          const panels = panelsForDialogScene(board, dialog, scene.id)
          return (
            <p key={scene.id} className="film-print-estimate muted">
              {scene.title}: {estimatePrintPagesDe(panels, verbose)}
            </p>
          )
        })}
        <div className="film-print-actions">
          <label className="film-print-verbose">
            <input
              type="checkbox"
              checked={verbose}
              onChange={(e) => setVerbose(e.target.checked)}
            />{' '}
            Ausführlich drucken
          </label>
          <Link className="btn btn-ghost" to={`/dialog/${id}/board`}>
            Zurück zu Bilder
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            Drucken oder als PDF speichern
          </button>
        </div>
      </header>

      <div className="film-print-doc">
        <p className="film-print-meta">
          {title} · {new Date().toLocaleDateString('de-CH')}
        </p>
        {chosen.map((scene) => {
          const panels = panelsForDialogScene(board, dialog, scene.id)
          return (
            <section key={scene.id} className="film-print-scene">
              <h2 className="film-print-scene-title">
                {scene.title}
                <span className="film-print-scene-pages muted">
                  {estimatePrintPagesDe(panels, verbose)}
                </span>
              </h2>
              {scene.noteDe ? <p className="film-print-scene-note muted">{scene.noteDe}</p> : null}
              <div className="film-print-panels">
                {panels.map((panel) => {
                  const lines = panelDialogueLines(panel, dialog, panels, scene.title)
                  const silent = packIsSilent(lines, panel)
                  const packNumber = stillPackNumber(board, panel)
                  return (
                    <article key={panel.id} className="film-print-panel">
                      <h3 className="film-beat-pack-num">Bild {packNumber}</h3>
                      {panel.stillUrl ? (
                        <figure className="film-print-figure">
                          <img src={panel.stillUrl} alt="" />
                        </figure>
                      ) : (
                        <p className="muted">Noch kein Bild</p>
                      )}
                      <div className="film-print-text">
                        {silent ? (
                          <p className="muted">Stumm</p>
                        ) : (
                          <FilmBeatText
                            lines={lines}
                            targetLanguage={dialog.targetLanguage}
                            sourceLanguage={dialog.sourceLanguage}
                          />
                        )}
                      </div>
                      <FilmStillMehrCompact panel={panel} />
                      <FilmStillHistory
                        panel={panel}
                        compact
                        verbose={verbose}
                        openOverride={verbose ? true : undefined}
                      />
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}