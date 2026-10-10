import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { displayFilmTitle, EMPTY_FILM_TITLE, resolvedFilmTitle } from '../../shared/film-draft'
import { StoryPictogram, type StoryPictogramName } from './StoryPictogram'

type Step = 'dialog' | 'board' | 'play'

const STEPS: Array<{ id: Step; title: string; icon: StoryPictogramName }> = [
  { id: 'dialog', title: 'Text', icon: 'text' },
  { id: 'board', title: 'Bilder', icon: 'pictures' },
  { id: 'play', title: 'Abspielen', icon: 'play' },
]

export type FilmSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function FilmSaveStatusText({ status }: { status: FilmSaveStatus }) {
  if (status === 'idle') return null
  if (status === 'saving') {
    return (
      <span className="film-save-status is-saving" aria-live="polite">
        …
      </span>
    )
  }
  if (status === 'saved') {
    return (
      <span className="film-save-status" aria-live="polite">
        ✓
      </span>
    )
  }
  return (
    <span className="film-save-status is-error" aria-live="polite">
      !
    </span>
  )
}

type Props = {
  dialogId?: string
  title?: string
  onTitleChange?: (value: string) => void
  saveStatus?: FilmSaveStatus
  compact?: boolean
}

export function FilmProjectNav({ dialogId, title, onTitleChange, saveStatus, compact }: Props) {
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

  const worldActive = path.startsWith('/library') || path.startsWith('/story')
  const active: Step | null = worldActive
    ? null
    : path.includes('/slideshow')
      ? 'play'
      : path.endsWith('/board') || path.endsWith('/export')
        ? 'board'
        : 'dialog'

  const href = (id: Step) => {
    if (!dialogId) return '/create'
    if (id === 'dialog') {
      if (path.startsWith('/create')) return `${path}${location.search}`
      return `/dialog/${dialogId}`
    }
    if (id === 'board') return `/dialog/${dialogId}/board`
    return `/dialog/${dialogId}/slideshow`
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
      {dialogId && !compact ? (
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
            title="Löschen"
            aria-label="Geschichte löschen"
          >
            {busyDelete ? '…' : '×'}
          </button>
        </div>
      ) : null}
      <nav className="story-workflow film-project-nav is-pictogram" aria-label="Geschichte">
        {STEPS.map((step) => {
          const isActive = active === step.id
          return (
            <Link
              key={step.id}
              to={href(step.id)}
              className={`story-workflow-step${isActive ? ' is-active' : ''}`}
              title={step.title}
              aria-current={isActive ? 'page' : undefined}
            >
              <StoryPictogram name={step.icon} />
              <span className="story-workflow-caption">{step.title}</span>
            </Link>
          )
        })}
        <Link
          to={dialogId ? `/library?dialog=${dialogId}` : '/library'}
          className={`story-workflow-step${worldActive ? ' is-active' : ''}`}
          title="Welt-Regal"
          aria-current={worldActive ? 'page' : undefined}
        >
          <StoryPictogram name="world" />
          <span className="story-workflow-caption">Welt</span>
        </Link>
      </nav>
    </div>
  )
}
