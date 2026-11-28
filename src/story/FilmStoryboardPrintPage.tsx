import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import {
  FilmBeatText,
  FilmRegieCheckNote,
  FilmRegiePlanNote,
  FilmStillHistory,
} from './FilmSceneGenerate'
import { stillPackNumber } from '../../shared/film-still-pack'
import {
  filmScenesFromDialog,
  normalizeFilmStoryboard,
  panelDialogueLines,
  panelsForDialogScene,
} from '../../shared/film-storyboard'
import type { Dialog } from '../types'
import type { FilmStoryboard } from '../../shared/film-storyboard'

function PrintPanel({
  panel,
  dialog,
  board,
  scenePanels,
  sceneTitle,
}: {
  panel: FilmStoryboard['panels'][number]
  dialog: Dialog
  board: FilmStoryboard
  scenePanels: FilmStoryboard['panels']
  sceneTitle: string
}) {
  const lines = panelDialogueLines(panel, dialog, scenePanels, sceneTitle)
  const num = stillPackNumber(board, panel)
  return (
    <article className="film-print-panel">
      <h2>
        Bild {num}
        {panel.caption ? ` — ${panel.caption}` : ''}
      </h2>
      {panel.stillUrl ? (
        <figure className="film-print-figure">
          <img src={panel.stillUrl} alt="" />
        </figure>
      ) : (
        <p className="muted">Noch kein Bild</p>
      )}
      {lines.length ? (
        <div className="film-print-text">
          <FilmBeatText
            lines={lines}
            targetLanguage={dialog.targetLanguage}
            sourceLanguage={dialog.sourceLanguage}
          />
        </div>
      ) : (
        <p className="muted">Stumm</p>
      )}
      <div className="film-print-open">
        <FilmRegiePlanNote panel={panel} />
        <FilmRegieCheckNote panel={panel} />
        <FilmStillHistory panel={panel} />
      </div>
    </article>
  )
}

export function FilmStoryboardPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const sceneFilter = params.get('szene')?.trim() || ''
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [board, setBoard] = useState<FilmStoryboard | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="page film-print-page">
      <header className="film-print-toolbar no-print">
        <h1>Druckansicht — {dialog.title}</h1>
        <p className="muted">
          {sceneFilter
            ? `Nur Szene: ${chosen[0]?.title ?? sceneFilter}`
            : `Alle ${chosen.length} Szenen, jedes Bild mit Regie und Verlauf.`}
        </p>
        <div className="film-print-actions">
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
          {dialog.title} · {new Date().toLocaleDateString('de-CH')}
        </p>
        {chosen.map((scene) => {
          const panels = panelsForDialogScene(board, dialog, scene.id)
          return (
            <section key={scene.id} className="film-print-scene">
              <h1 className="film-print-scene-title">{scene.title}</h1>
              {panels.map((panel) => (
                <PrintPanel
                  key={panel.id}
                  panel={panel}
                  dialog={dialog}
                  board={board}
                  scenePanels={panels}
                  sceneTitle={scene.title}
                />
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}