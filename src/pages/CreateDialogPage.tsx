import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { LanguageFlag } from '../components/LanguageFlag'
import type { FilmDraftMode } from '../types'
import { LANGUAGES } from '../types'
import { useI18n } from '../i18n/I18nContext'
import { FilmProjectNav, FilmSaveStatusText, type FilmSaveStatus } from '../story/FilmProjectNav'
import { FILM_DRAFT_MODES, EMPTY_FILM_TITLE, resolvedFilmTitle } from '../../shared/film-draft'
import { createFilmDraft, patchFilmDraft } from '../lib/filmDraftSave'

const SAVE_WAIT_MS = 1000

export function CreateDialogPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const folderId = searchParams.get('folder')
  const urlId = searchParams.get('id')

  const [targetLanguage, setTargetLanguage] = useState('fr')
  const [title, setTitle] = useState('')
  const [filmPrompt, setFilmPrompt] = useState('')
  const [dialogId, setDialogId] = useState<string | null>(urlId)
  const [draftMode, setDraftMode] = useState<FilmDraftMode>('lucky')
  const [infoOpen, setInfoOpen] = useState(false)
  const [questions, setQuestions] = useState<string[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [booting, setBooting] = useState(!!urlId)
  const [error, setError] = useState('')
  const [saveStatus, setSaveStatus] = useState<FilmSaveStatus>('idle')

  const dialogIdRef = useRef<string | null>(urlId)
  const skipSaveRef = useRef(true)
  const persistChain = useRef(Promise.resolve())
  const titleRef = useRef(title)
  const promptRef = useRef(filmPrompt)
  const langRef = useRef(targetLanguage)
  titleRef.current = title
  promptRef.current = filmPrompt
  langRef.current = targetLanguage

  useEffect(() => {
    if (!urlId) {
      skipSaveRef.current = false
      return
    }
    let cancelled = false
    api.dialogs
      .get(urlId)
      .then(({ dialog }) => {
        if (cancelled) return
        dialogIdRef.current = dialog.id
        setDialogId(dialog.id)
        setTitle(dialog.title === EMPTY_FILM_TITLE ? '' : dialog.title)
        setFilmPrompt(dialog.filmPrompt ?? dialog.creationPrompt ?? '')
        setTargetLanguage(dialog.targetLanguage)
        setSaveStatus('saved')
        skipSaveRef.current = true
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Konnte den Entwurf nicht laden.')
      })
      .finally(() => {
        if (!cancelled) setBooting(false)
      })
    return () => {
      cancelled = true
    }
    // Nur beim ersten Öffnen laden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persist = () => {
    persistChain.current = persistChain.current.then(async () => {
      const nextTitle = titleRef.current
      const nextPrompt = promptRef.current
      if (!nextTitle.trim() && !nextPrompt.trim()) return
      setSaveStatus('saving')
      try {
        if (!dialogIdRef.current) {
          const dialog = await createFilmDraft({
            title: nextTitle,
            filmPrompt: nextPrompt,
            targetLanguage: langRef.current,
            folderId: folderId ?? null,
          })
          dialogIdRef.current = dialog.id
          setDialogId(dialog.id)
          const next = new URLSearchParams()
          if (folderId) next.set('folder', folderId)
          next.set('id', dialog.id)
          navigate(`/create?${next.toString()}`, { replace: true })
        } else {
          await patchFilmDraft(dialogIdRef.current, {
            title: nextTitle,
            filmPrompt: nextPrompt,
            targetLanguage: langRef.current,
          })
        }
        setSaveStatus('saved')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Speichern fehlgeschlagen.'
        if (/nicht gefunden/i.test(msg)) return
        setSaveStatus('error')
        setError(msg)
      }
    })
    return persistChain.current
  }

  useEffect(() => {
    if (booting) return
    if (skipSaveRef.current) {
      skipSaveRef.current = false
      return
    }
    if (!title.trim() && !filmPrompt.trim()) return
    const timer = window.setTimeout(() => void persist(), SAVE_WAIT_MS)
    return () => window.clearTimeout(timer)
  }, [title, filmPrompt, targetLanguage, booting])

  useEffect(() => {
    const flush = () => {
      if (!titleRef.current.trim() && !promptRef.current.trim()) return
      void persist()
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [])

  const saveFromResult = async (result: {
    title?: string
    sections?: import('../types').DialogSection[]
    imageDirection?: string
    soundDirection?: string
    speechDirection?: string
  }) => {
    if (!result.title || !result.sections?.length) {
      throw new Error('Kein Dialog gekommen.')
    }
    const keptPrompt = promptRef.current
    const keptTitle = resolvedFilmTitle(titleRef.current, keptPrompt)
    const payload = {
      title: titleRef.current.trim() ? keptTitle : result.title.trim() || keptTitle,
      sourceLanguage: 'de' as const,
      targetLanguage: langRef.current,
      length: 'long' as const,
      sections: result.sections,
      folderId: folderId ?? null,
      creationMode: 'topic' as const,
      creationPrompt: keptPrompt.trim(),
      filmPrompt: keptPrompt,
      imageDirection: result.imageDirection,
      soundDirection: result.soundDirection,
      speechDirection: result.speechDirection,
    }
    if (dialogIdRef.current) {
      const { dialog } = await api.dialogs.update(dialogIdRef.current, {
        title: payload.title,
        sections: payload.sections,
        filmPrompt: payload.filmPrompt,
        creationPrompt: payload.creationPrompt,
        imageDirection: payload.imageDirection,
        soundDirection: payload.soundDirection,
        speechDirection: payload.speechDirection,
        targetLanguage: payload.targetLanguage,
      })
      navigate(`/dialog/${dialog.id}`)
      return
    }
    const { dialog } = await api.dialogs.create(payload)
    navigate(`/dialog/${dialog.id}`)
  }

  const answersText = questions
    .map((q, i) => {
      const a = answers[i]?.trim()
      return a ? `Frage: ${q}\nAntwort: ${a}` : ''
    })
    .filter(Boolean)
    .join('\n\n')

  const handleGo = async () => {
    if (!filmPrompt.trim()) return
    setLoading(true)
    setError('')
    try {
      await persist()
      const asking = draftMode === 'ask' && questions.length === 0
      const result = await api.ai.filmFromPrompt(
        filmPrompt.trim(),
        targetLanguage,
        asking ? 'ask' : draftMode === 'ask' ? 'embellish' : draftMode,
        asking ? undefined : answersText || undefined,
      )
      if (result.questions?.length) {
        setQuestions(result.questions)
        setAnswers(result.questions.map(() => ''))
        return
      }
      await saveFromResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="create-page">
      <FilmProjectNav
        dialogId={dialogId ?? undefined}
        title={title}
        onTitleChange={setTitle}
        saveStatus={saveStatus}
      />
      <div className="page-header">
        <h1>{t('create.title')}</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {booting && <p className="muted">Lade Entwurf …</p>}

      <label>
        Titel
        <input
          className="film-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={EMPTY_FILM_TITLE}
          disabled={booting}
        />
      </label>

      <label className="settings-lang-only">
        {t('create.targetLang')}
        <span className="lang-select-row">
          <LanguageFlag code={targetLanguage} size="md" />
          <select
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            disabled={booting}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </span>
      </label>

      <section className="panel story-sofa-cta film-prompt-panel">
        <div className="film-prompt-head">
          <h2>Dein Film</h2>
          <button
            type="button"
            className="film-info-btn"
            aria-expanded={infoOpen}
            aria-label="Hinweis zu diesem Feld"
            onClick={() => setInfoOpen((v) => !v)}
          >
            i
          </button>
        </div>
        {infoOpen && (
          <p className="muted film-prompt-info">
            Ein Fenster für alles: Handlung, Dialog, Bild, Ton, Sprache. Die KI trennt selbst, was gesprochen
            wird und was Regie ist. Beliebig viele Figuren, beliebig lang — auch ein 15-Minuten-Film. Stil (Foto
            oder Zeichnung) erst später beim Film. Der Text wird laufend gespeichert.
          </p>
        )}
        <textarea
          className="film-prompt-input"
          rows={14}
          value={filmPrompt}
          disabled={booting}
          onChange={(e) => {
            setFilmPrompt(e.target.value)
            if (questions.length) {
              setQuestions([])
              setAnswers([])
            }
          }}
          placeholder={
            'Julien und Tara im Herbstpark. Julien sitzt auf der Bank, Tara kommt mit Skateboard.\nJulien: Schön hier.\nTara winkt und ruft Juhe.\nVögel, dann Stille. Julien flüstert.'
          }
        />

        <fieldset className="film-draft-modes">
          <legend>Wie soll die KI damit umgehen?</legend>
          {FILM_DRAFT_MODES.map((m) => (
            <label key={m.id} className={`film-draft-mode${draftMode === m.id ? ' is-on' : ''}`}>
              <input
                type="radio"
                name="film-draft-mode"
                checked={draftMode === m.id}
                onChange={() => {
                  setDraftMode(m.id)
                  setQuestions([])
                  setAnswers([])
                }}
              />
              <span>
                <strong>{m.label}</strong>
                <span className="muted">{m.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {questions.length > 0 && (
          <div className="film-questions">
            <h3>Rückfragen</h3>
            {questions.map((q, i) => (
              <label key={`${q}-${i}`}>
                {q}
                <input
                  type="text"
                  value={answers[i] ?? ''}
                  onChange={(e) => {
                    const next = [...answers]
                    next[i] = e.target.value
                    setAnswers(next)
                  }}
                />
              </label>
            ))}
          </div>
        )}

        <div className="button-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleGo()}
            disabled={loading || booting || !filmPrompt.trim()}
          >
            {loading
              ? 'Denke nach …'
              : questions.length
                ? 'Mit Antworten weiter'
                : draftMode === 'ask'
                  ? 'Rückfragen stellen'
                  : 'Dialog daraus machen'}
          </button>
          <FilmSaveStatusText status={saveStatus} />
        </div>
      </section>
    </div>
  )
}
