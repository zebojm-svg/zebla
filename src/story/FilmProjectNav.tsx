import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { displayFilmTitle, EMPTY_FILM_TITLE, resolvedFilmTitle } from '../../shared/film-draft'

type Step = 'dialog' | 'board' | 'library' | 'export'

const STEPS: Array<{ id: Step; title: string; hint: string }> = [
  { id: 'dialog', title: 'Dialog', hint: 'Text und Regie' },
  { id: 'board', title: 'Storyboard', hint: 'Bilder aus der Bibliothek' },
  { id: 'library', title: 'Bibliothek', hint: 'Posen und Hintergründe' },
  { id: 'export', title: 'Film', hint: 'Standbilder, Szene für Szene' },
]

export type FilmSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function FilmSaveStatusText({ status }: { status: FilmSaveStatus }) {
  if (status === 'idle') return null
  if (status === 'saving') {
    return (
      <span className="film-save-status is-saving" aria-live="polite">
        Speichert…
      </span>
    )
  }
  if (status === 'saved') {
    return (
      <span className="film-save-status" aria-live="polite">
        Gespeichert
      </span>
    )
  }
  return (
    <span className="film-save-status is-error" aria-live="polite">
      Nicht gespeichert
    </span>
  )
}

type Props = {
  dialogId?: string
  title?: string
  onTitleChange?: (value: string) => void
  saveStatus?: FilmSaveStatus
}

export function FilmProjectNav({ dialogId, title, onTitleChange, saveStatus }: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname
  const controlled = onTitleChange !== undefined
  const [localTitle, setLocalTitle] = useState(title ?? '')
  const [navSave, setNavSave] = useState<FilmSaveStatus>('idle')
  const [busyDelete, setBusyDelete] = useState(false)
  const [titleReady, setTitleReady] = useState(controlled)
  const loadedTitleRef = useRef(title ?? '')

  useEffect(() => {
    if (title !== undefined) setLocalTitle(title)
  }, [title])

  useEffect(() => {
    if (!dialogId || controlled) return
    let cancelled = false
    setTitleReady(false)
    api.dialogs
      .get(dialogId)
      .then(({ dialog }) => {
        if (cancelled) return
        setLocalTitle(dialog.title === EMPTY_FILM_TITLE ? '' : dialog.title)
        loadedTitleRef.current = dialog.title
        setTitleReady(true)
      })
      .catch(() => {
        if (!cancelled) setTitleReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [dialogId, controlled])

  useEffect(() => {
    if (!dialogId || controlled || !titleReady) return
    const resolved = resolvedFilmTitle(localTitle, '')
    if (resolved === loadedTitleRef.current) return
    const timer = window.setTimeout(() => {
      setNavSave('saving')
      void api.dialogs
        .update(dialogId, { title: resolved })
        .then(() => {
          loadedTitleRef.current = resolved
          setNavSave('saved')
        })
        .catch(() => setNavSave('error'))
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [localTitle, dialogId, controlled, titleReady])

  const shownTitle = controlled ? (title ?? '') : localTitle
  const status = saveStatus ?? navSave

  const active: Step =
    path.startsWith('/library') || path.startsWith('/story')
      ? 'library'
      : path.endsWith('/board')
        ? 'board'
        : path.endsWith('/export')
          ? 'export'
          : 'dialog'

  const href = (id: Step) => {
    if (id === 'library') return dialogId ? `/library?dialog=${dialogId}` : '/library'
    if (!dialogId) return '/create'
    if (id === 'dialog') {
      if (path.startsWith('/create')) return `${path}${location.search}`
      return `/dialog/${dialogId}`
    }
    if (id === 'board') return `/dialog/${dialogId}/board`
    return `/dialog/${dialogId}/export`
  }

  const onTitleInput = (value: string) => {
    if (controlled) onTitleChange?.(value)
    else setLocalTitle(value)
  }

  const handleDelete = async () => {
    if (!dialogId) return
    const label = displayFilmTitle(shownTitle || loadedTitleRef.current)
    if (
      !window.confirm(
        `„${label}“ wirklich löschen? Das kann man nicht rückgängig machen.`,
      )
    ) {
      return
    }
    setBusyDelete(true)
    try {
      await api.dialogs.delete(dialogId)
      navigate('/')
    } catch (err) {
      setBusyDelete(false)
      window.alert(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.')
    }
  }

  return (
    <div className="film-project-shell">
      {dialogId ? (
        <div className="film-project-bar">
          <label className="film-project-title">
            <span className="film-project-title-label">Titel</span>
            <input
              className="film-title-input"
              value={shownTitle}
              placeholder={EMPTY_FILM_TITLE}
              aria-label="Filmtitel"
              onChange={(e) => onTitleInput(e.target.value)}
            />
          </label>
          <FilmSaveStatusText status={status} />
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-danger"
            disabled={busyDelete}
            onClick={() => void handleDelete()}
          >
            {busyDelete ? '…' : 'Löschen'}
          </button>
        </div>
      ) : null}
      <nav className="story-workflow film-project-nav" aria-label="Film-Projekt">
        {STEPS.map((step) => {
          const isActive = active === step.id
          const inner = (
            <>
              <span className="story-workflow-num">
                {step.id === 'dialog' ? '1' : step.id === 'board' ? '2' : step.id === 'library' ? '3' : '4'}
              </span>
              <span className="story-workflow-text">
                <strong>{step.title}</strong>
                <span className="muted">{step.hint}</span>
              </span>
            </>
          )
          return (
            <Link
              key={step.id}
              to={href(step.id)}
              className={`story-workflow-step${isActive ? ' is-active' : ''}`}
            >
              {inner}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
