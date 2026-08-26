import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { LanguageFlag } from '../components/LanguageFlag'
import type { FilmDraftMode } from '../types'
import { LANGUAGES } from '../types'
import { useI18n } from '../i18n/I18nContext'
import { FilmProjectNav } from '../story/FilmProjectNav'

const MODES: Array<{ id: FilmDraftMode; label: string; hint: string }> = [
  {
    id: 'embellish',
    label: 'Dialoge ausschmücken',
    hint: 'Die KI macht aus Stichworten einen längeren Film-Dialog — so lang wie die Geschichte braucht.',
  },
  {
    id: 'ask',
    label: 'Zuerst Rückfragen',
    hint: 'Die KI fragt nach, bevor sie Dialog und Storyboard plant.',
  },
  {
    id: 'lucky',
    label: 'Auf gut Glück',
    hint: 'Kein Nachfragen. Sie nimmt den Text und legt los.',
  },
]

export function CreateDialogPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const folderId = searchParams.get('folder')
  const [targetLanguage, setTargetLanguage] = useState('fr')
  const [filmPrompt, setFilmPrompt] = useState('')
  const [draftMode, setDraftMode] = useState<FilmDraftMode>('lucky')
  const [infoOpen, setInfoOpen] = useState(false)
  const [questions, setQuestions] = useState<string[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
    const { dialog } = await api.dialogs.create({
      title: result.title,
      sourceLanguage: 'de',
      targetLanguage,
      length: 'long',
      sections: result.sections,
      folderId: folderId ?? null,
      creationMode: 'topic',
      creationPrompt: filmPrompt.trim(),
      filmPrompt: filmPrompt.trim(),
      imageDirection: result.imageDirection,
      soundDirection: result.soundDirection,
      speechDirection: result.speechDirection,
    })
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
      <FilmProjectNav />
      <div className="page-header">
        <h1>{t('create.title')}</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <label className="settings-lang-only">
        {t('create.targetLang')}
        <span className="lang-select-row">
          <LanguageFlag code={targetLanguage} size="md" />
          <select value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)}>
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
            oder Zeichnung) erst später beim Film.
          </p>
        )}
        <textarea
          className="film-prompt-input"
          rows={14}
          value={filmPrompt}
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
          {MODES.map((m) => (
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
            disabled={loading || !filmPrompt.trim()}
          >
            {loading
              ? 'Denke nach …'
              : questions.length
                ? 'Mit Antworten weiter'
                : draftMode === 'ask'
                  ? 'Rückfragen stellen'
                  : 'Dialog daraus machen'}
          </button>
        </div>
      </section>
    </div>
  )
}
