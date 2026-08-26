import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { BirkenbihlLine } from '../components/BirkenbihlLine'
import { LanguageFlag } from '../components/LanguageFlag'
import { LANGUAGES, languageName, needsRomanization } from '../types'
import { getIncludeRomanization, setIncludeRomanization, getAskVisualQuestions, setAskVisualQuestions } from '../lib/preferences'
import { CostConfirmDialog } from '../components/CostConfirmDialog'
import { useCostConfirm } from '../hooks/useCostConfirm'
import { formatCreationPromptForDisplay } from '../../shared/dialog-image-context'
import { uniqueSpeakersInDialog, speakerGender } from '../../shared/speakers'
import { copyTextToClipboard } from '../utils/clipboard'
import { useI18n } from '../i18n/I18nContext'
import {
  estimateAllSceneImages,
  estimateAllSectionImages,
  estimateBirkenbihl,
  estimateSceneImages,
  estimateSectionImage,
  estimateTranslate,
  estimateVisualTest,
  lineCount,
} from '../lib/costEstimates'
import { VisualBriefPanel } from '../components/VisualBriefPanel'
import { FilmProjectNav, FilmSaveStatusText, type FilmSaveStatus } from '../story/FilmProjectNav'
import { EMPTY_FILM_TITLE, FILM_DRAFT_MODES, displayFilmTitle, isPlaceholderDraftSection } from '../../shared/film-draft'
import { patchFilmDraft } from '../lib/filmDraftSave'
import type { Dialog, FilmDraftMode, VisualQuestion } from '../types'

export function DialogEditorPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useI18n()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [translateLang, setTranslateLang] = useState('en')
  const [birkenbihlLang, setBirkenbihlLang] = useState('de')
  const [includeRomanization, setIncludeRomanizationState] = useState(true)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [imageDirectionDraft, setImageDirectionDraft] = useState('')
  const [soundDirectionDraft, setSoundDirectionDraft] = useState('')
  const [speechDirectionDraft, setSpeechDirectionDraft] = useState('')
  const [filmPromptDraft, setFilmPromptDraft] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [saveStatus, setSaveStatus] = useState<FilmSaveStatus>('idle')
  const [draftMode, setDraftMode] = useState<FilmDraftMode>('lucky')
  const [askVisualQuestions, setAskVisualQuestionsState] = useState(true)
  const [visualQuestions, setVisualQuestions] = useState<VisualQuestion[]>([])
  const [pendingSectionId, setPendingSectionId] = useState<string | null>(null)
  const { pending: costPending, confirm: confirmCost, close: closeCost } = useCostConfirm()

  const skipSaveRef = useRef(true)
  const persistChain = useRef(Promise.resolve())
  const titleRef = useRef('')
  const promptRef = useRef('')
  const dirtyRef = useRef(false)
  titleRef.current = titleDraft
  promptRef.current = filmPromptDraft

  const reload = async (opts?: { keepDrafts?: boolean }) => {
    if (!id) return
    const { dialog: d } = await api.dialogs.get(id)
    setDialog(d)
    setTranslateLang(d.targetLanguage)
    setBirkenbihlLang(d.sourceLanguage)
    setIncludeRomanizationState(getIncludeRomanization())
    setImageDirectionDraft(d.imageDirection ?? '')
    setSoundDirectionDraft(d.soundDirection ?? '')
    setSpeechDirectionDraft(d.speechDirection ?? '')
    if (!opts?.keepDrafts && !dirtyRef.current) {
      skipSaveRef.current = true
      setFilmPromptDraft(d.filmPrompt ?? d.creationPrompt ?? '')
      setTitleDraft(d.title === EMPTY_FILM_TITLE ? '' : d.title)
    }
    setAskVisualQuestionsState(getAskVisualQuestions())
  }

  const persistMeta = () => {
    if (!id) return persistChain.current
    persistChain.current = persistChain.current.then(async () => {
      setSaveStatus('saving')
      try {
        const d = await patchFilmDraft(id, {
          title: titleRef.current,
          filmPrompt: promptRef.current,
        })
        setDialog(d)
        dirtyRef.current = false
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
    skipSaveRef.current = true
    dirtyRef.current = false
    setSaveStatus('idle')
    reload()
      .catch((err) => setError(err instanceof Error ? err.message : 'Fehler'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (loading) return
    if (skipSaveRef.current) {
      skipSaveRef.current = false
      return
    }
    dirtyRef.current = true
    const timer = window.setTimeout(() => void persistMeta(), 1000)
    return () => window.clearTimeout(timer)
  }, [titleDraft, filmPromptDraft, loading, id])

  useEffect(() => {
    const flush = () => {
      if (dirtyRef.current) void persistMeta()
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
  }, [id])

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setError('')
    setStatus('')
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="page-center">
        <p className="muted">Lade Dialog …</p>
      </div>
    )
  }

  if (!dialog) {
    return (
      <div className="page-center">
        <p>Dialog nicht gefunden.</p>
        <Link to="/">Zurück</Link>
      </div>
    )
  }

  const shareUrl =
    dialog.shareToken && typeof window !== 'undefined'
      ? `${window.location.origin}/share/${dialog.shareToken}`
      : ''

  const toggleSharing = async (enabled: boolean) => {
    setShareBusy(true)
    setError('')
    try {
      const { dialog: d } = await api.dialogs.setSharing(dialog.id, enabled)
      setDialog(d)
      setShareCopied(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Freigabe fehlgeschlagen.')
    } finally {
      setShareBusy(false)
    }
  }

  const copyShareLink = async () => {
    if (!shareUrl) return
    await copyTextToClipboard(shareUrl)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2500)
  }

  const generateSceneImages = async (sectionId: string, start: Dialog): Promise<Dialog> => {
    let beatIndex = -1
    let replan = !start.visualScript?.beats?.length
    let current = start
    let done = false
    while (!done) {
      setStatus(
        beatIndex < 0
          ? 'Vorbereitung (ein Schritt, ca. 20–40 s) …'
          : replan
            ? 'KI plant Bilderskript …'
            : `Bild ${beatIndex + 1} … (ca. 15–30 s)`,
      )
      const res = await api.ai.imageLines(
        current.id,
        sectionId,
        beatIndex,
        replan,
        false,
        false,
      )
      current = res.dialog
      setDialog(res.dialog)
      if (beatIndex < 0) {
        if (res.prepPending) {
          setStatus(res.reason ?? 'Nächstes Portrait …')
          replan = false
          await new Promise((r) => setTimeout(r, 1500))
          continue
        }
        beatIndex = 0
        replan = false
        continue
      }
      done = res.done
      beatIndex++
      replan = false
      if (!done) await new Promise((r) => setTimeout(r, 800))
    }
    setStatus(`Fertig – Bilder für diesen Abschnitt. Schon erzeugte Bilder wurden behalten.`)
    return current
  }

  const runPictureStory = async (sectionId: string, fromDialog?: Dialog) => {
    let current = fromDialog ?? dialog
    setPendingSectionId(sectionId)

    const ask = askVisualQuestions
    if (!current.visualBrief?.directorPromptEn) {
      setStatus('Bild-Regie liest Dialog und Hinweise …')
      const res = await api.ai.visualBrief(current.id, { askQuestions: ask })
      current = res.dialog
      setDialog(res.dialog)
      if (res.questions?.length) {
        setVisualQuestions(res.questions)
        setStatus('Bitte die Fragen zur Bild-Regie beantworten.')
        return
      }
      setVisualQuestions([])
    }

    if (!current.visualBrief?.testApproved) {
      if (!current.visualBrief?.testImageUrl) {
        setStatus('Testbild wird erzeugt (ca. 20–40 s) …')
        const t = await api.ai.visualTest(current.id)
        current = t.dialog
        setDialog(t.dialog)
      }
      setStatus('Bitte das Testbild prüfen.')
      return
    }

    const longOneBlock =
      current.sections.length === 1 && (current.sections[0]?.lines.length ?? 0) >= 8
    if (longOneBlock) {
      setStatus('Teile die Geschichte in Szenen (Sofa, Küche, …) …')
      const split = await api.ai.split(current.id)
      if (split.dialog) {
        current = split.dialog
        setDialog(split.dialog)
      }
      for (const sec of current.sections) {
        current = await generateSceneImages(sec.id, current)
      }
      return
    }

    if (current.sections.length > 1) {
      for (const sec of current.sections) {
        current = await generateSceneImages(sec.id, current)
      }
      return
    }

    await generateSceneImages(sectionId, current)
  }

  const saveLineCue = async (
    sectionId: string,
    lineId: string,
    field: 'cueImage' | 'cueSound' | 'cueSpeech',
    value: string,
  ) => {
    const sections = dialog.sections.map((sec) =>
      sec.id !== sectionId
        ? sec
        : {
            ...sec,
            lines: sec.lines.map((ln) =>
              ln.id === lineId ? { ...ln, [field]: value.trim() || undefined } : ln,
            ),
          },
    )
    await runAction(`cue-${lineId}-${field}`, async () => {
      const { dialog: d } = await api.dialogs.update(dialog.id, { sections })
      setDialog(d)
    })
  }

  return (
    <div className="editor-page">
      <FilmProjectNav
        dialogId={dialog.id}
        title={titleDraft}
        onTitleChange={setTitleDraft}
        saveStatus={saveStatus}
      />
      <div className="page-header">
        <div>
          <h1>{displayFilmTitle(titleDraft)}</h1>
          <p className="muted">
            <span className="dialog-lang-flag-inline" aria-hidden>
              <LanguageFlag code={dialog.targetLanguage} size="md" />
            </span>{' '}
            {languageName(dialog.targetLanguage)} · {dialog.sections.length} Abschnitt
            {dialog.sections.length !== 1 ? 'e' : ''}{' '}
            <FilmSaveStatusText status={saveStatus} />
          </p>
        </div>
        <div className="header-actions">
          <select
            value={dialog.targetLanguage}
            disabled={!!busy}
            aria-label="Zielsprache"
            onChange={(e) => {
              const lang = e.target.value
              void runAction('lang', async () => {
                const { dialog: d } = await api.dialogs.update(dialog.id, { targetLanguage: lang })
                setDialog(d)
                setTranslateLang(lang)
              })
            }}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
          <Link to={`/dialog/${dialog.id}/board`} className="btn btn-story-studio">
            Ins Storyboard
          </Link>
          <Link to={`/dialog/${dialog.id}/slideshow`} className="btn btn-primary">
            {t('editor.slideshow')}
          </Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {status && <div className="alert alert-warn">{status}</div>}

      <section className="panel dialog-meta-panel">
        <h2>Vorstellung vom Film</h2>
        <label className="dialog-meta-block">
          <span className="dialog-meta-label">Titel</span>
          <input
            className="film-title-input"
            value={titleDraft}
            placeholder={EMPTY_FILM_TITLE}
            onChange={(e) => setTitleDraft(e.target.value)}
          />
        </label>
        <label className="dialog-meta-block">
          <span className="dialog-meta-label">Prompt (Handlung, Bild, Ton, Sprache)</span>
          <textarea
            rows={8}
            value={filmPromptDraft}
            onChange={(e) => setFilmPromptDraft(e.target.value)}
            placeholder="Was soll man sehen, hören, sagen? Beliebig viele Figuren …"
          />
        </label>
        {formatCreationPromptForDisplay(dialog) && (
          <div className="dialog-meta-block">
            <h3 className="dialog-meta-label">Ursprüngliche Eingabe</h3>
            <pre className="dialog-meta-pre">{formatCreationPromptForDisplay(dialog)}</pre>
          </div>
        )}
        <label className="dialog-meta-block">
          <span className="dialog-meta-label">Bild-Regie</span>
          <textarea
            rows={3}
            value={imageDirectionDraft}
            onChange={(e) => setImageDirectionDraft(e.target.value)}
            placeholder="Ort, Figuren, Posen (z.B. Julien sitzt links im Park) …"
          />
        </label>
        <label className="dialog-meta-block">
          <span className="dialog-meta-label">Ton-Regie</span>
          <textarea
            rows={2}
            value={soundDirectionDraft}
            onChange={(e) => setSoundDirectionDraft(e.target.value)}
            placeholder="Vögel, Straßenlärm, Stille, Musik …"
          />
        </label>
        <label className="dialog-meta-block">
          <span className="dialog-meta-label">Sprach-Regie</span>
          <textarea
            rows={2}
            value={speechDirectionDraft}
            onChange={(e) => setSpeechDirectionDraft(e.target.value)}
            placeholder="laut, flüstern, Pause, fröhlich …"
          />
        </label>
        <div className="dialog-meta-block">
          <fieldset className="film-draft-modes">
            <legend>Dialog aus dem Text oben machen</legend>
            {FILM_DRAFT_MODES.map((m) => (
              <label key={m.id} className={`film-draft-mode${draftMode === m.id ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="editor-film-draft-mode"
                  checked={draftMode === m.id}
                  onChange={() => setDraftMode(m.id)}
                />
                <span>
                  <strong>{m.label}</strong>
                  <span className="muted">{m.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="button-row">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!!busy || !filmPromptDraft.trim()}
              onClick={() =>
                void runAction('film-from-prompt', async () => {
                  await persistMeta()
                  const placeholder = dialog.sections.every((s) => isPlaceholderDraftSection(s))
                  if (
                    !placeholder &&
                    dialog.sections.some((s) => s.lines.some((l) => l.text.trim())) &&
                    !window.confirm('Den bisherigen Dialog ersetzen? Dein Text oben bleibt gespeichert.')
                  ) {
                    return
                  }
                  const asking = draftMode === 'ask'
                  const result = await api.ai.filmFromPrompt(
                    filmPromptDraft.trim(),
                    dialog.targetLanguage,
                    asking ? 'ask' : draftMode,
                  )
                  if (result.questions?.length) {
                    setStatus(
                      `Die KI hat Rückfragen: ${result.questions.join(' · ')} Bitte unten im Text antworten oder «Auf gut Glück» wählen.`,
                    )
                    return
                  }
                  if (!result.title || !result.sections?.length) {
                    throw new Error('Kein Dialog gekommen.')
                  }
                  const { dialog: d } = await api.dialogs.update(dialog.id, {
                    title: titleDraft.trim() || result.title,
                    sections: result.sections,
                    filmPrompt: filmPromptDraft,
                    imageDirection: result.imageDirection,
                    soundDirection: result.soundDirection,
                    speechDirection: result.speechDirection,
                  })
                  setDialog(d)
                  if (result.imageDirection) setImageDirectionDraft(result.imageDirection)
                  if (result.soundDirection) setSoundDirectionDraft(result.soundDirection)
                  if (result.speechDirection) setSpeechDirectionDraft(result.speechDirection)
                  setStatus('Dialog gespeichert. Dein Text oben ist geblieben.')
                })
              }
            >
              {busy === 'film-from-prompt' ? 'Denke nach …' : 'Dialog daraus machen'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!!busy}
              onClick={() =>
                void runAction('image-direction', async () => {
                  await persistMeta()
                  const { dialog: d } = await api.dialogs.update(dialog.id, {
                    filmPrompt: filmPromptDraft,
                    imageDirection: imageDirectionDraft.trim() || filmPromptDraft.trim(),
                    soundDirection: soundDirectionDraft.trim(),
                    speechDirection: speechDirectionDraft.trim(),
                    visualBrief: null,
                  })
                  setDialog(d)
                  setStatus('Vorstellung gespeichert. Danach «Ins Storyboard».')
                })
              }
            >
              {busy === 'image-direction' ? '…' : 'Vorstellung speichern'}
            </button>
            <FilmSaveStatusText status={saveStatus} />
          </div>
          <p className="muted dialog-meta-hint">
            Titel und Text werden laufend gespeichert. Pro Zeile kannst du unten noch Bild / Ton / Sprache
            ergänzen. Das Storyboard klebt vorhandene Posen und Hintergründe, statt alles neu zu malen.
          </p>
        </div>

        <VisualBriefPanel
          dialog={dialog}
          questions={visualQuestions}
          askQuestions={askVisualQuestions}
          onAskQuestionsChange={(on) => {
            setAskVisualQuestionsState(on)
            setAskVisualQuestions(on)
          }}
          busy={!!busy}
          onAnswer={(answers) => {
            void runAction('visual-brief', async () => {
              setStatus('Bild-Regie schreibt den Zwischen-Prompt …')
              const res = await api.ai.visualBrief(dialog.id, {
                answers,
                askQuestions: false,
              })
              setDialog(res.dialog)
              setVisualQuestions(res.questions ?? [])
              if (pendingSectionId && !res.questions?.length) {
                await runPictureStory(pendingSectionId, res.dialog)
              }
            })
          }}
          onApproveTest={() => {
            void runAction('visual-test', async () => {
              const res = await api.ai.visualTest(dialog.id, { approve: true })
              setDialog(res.dialog)
              if (pendingSectionId) await runPictureStory(pendingSectionId, res.dialog)
            })
          }}
          onCommentTest={(comment) => {
            void runAction('visual-test', async () => {
              if (!(await confirmCost(estimateVisualTest()))) return
              setStatus('Neues Testbild …')
              const res = await api.ai.visualTest(dialog.id, { comment })
              setDialog(res.dialog)
            })
          }}
        />

        {uniqueSpeakersInDialog(dialog).length > 0 && (
          <div className="dialog-meta-block speaker-gender-block">
            <h3 className="dialog-meta-label">Geschlecht der Sprecher</h3>
            <p className="muted dialog-meta-hint">
              Falls die KI das Geschlecht aus dem Namen nicht erkennt – wichtig für Stimme und Erscheinungsbild.
            </p>
            <div className="speaker-gender-grid">
              {uniqueSpeakersInDialog(dialog).map((speaker) => (
                <label key={speaker} className="speaker-gender-row">
                  <span className="speaker-gender-name">{speaker}</span>
                  <select
                    value={speakerGender(dialog, speaker) ?? ''}
                    disabled={!!busy}
                    onChange={(e) => {
                      const val = e.target.value as 'male' | 'female' | ''
                      void runAction(`gender-${speaker}`, async () => {
                        const profiles = { ...(dialog.speakerProfiles ?? {}) }
                        if (val) profiles[speaker] = { gender: val }
                        else delete profiles[speaker]
                        const characterBible = dialog.characterBible?.map((c) =>
                          c.name === speaker && val ? { ...c, gender: val } : c,
                        )
                        const { dialog: d } = await api.dialogs.update(dialog.id, {
                          speakerProfiles: profiles,
                          characterBible,
                        })
                        setDialog(d)
                        setStatus(
                          'Geschlecht gespeichert. Bei Bedarf „Bilder / Bilderskript (KI)“ und Audio neu erstellen.',
                        )
                      })
                    }}
                  >
                    <option value="">Automatisch</option>
                    <option value="female">Weiblich</option>
                    <option value="male">Männlich</option>
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="panel toolbar-panel">
        <h2>KI-Werkzeuge</h2>
        <div className="toolbar-grid">
          <div className="tool-group">
            <span className="tool-label">Übersetzen in</span>
            <div className="tool-controls">
              <span className="lang-select-row">
                <LanguageFlag code={translateLang} size="sm" />
                <select value={translateLang} onChange={(e) => setTranslateLang(e.target.value)}>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!!busy}
                onClick={async () => {
                  if (!(await confirmCost(estimateTranslate(lineCount(dialog))))) return
                  await runAction('translate', async () => {
                    const { dialog: d } = await api.ai.translate(dialog.id, translateLang)
                    setDialog(d)
                  })
                }}
              >
                {busy === 'translate' ? '…' : 'Übersetzen'}
              </button>
            </div>
          </div>

          <div className="tool-group tool-group--stack">
            <span className="tool-label">Birkenbihl (Muttersprache)</span>
            <div className="tool-controls">
              <span className="lang-select-row">
                <LanguageFlag code={birkenbihlLang} size="sm" />
                <select value={birkenbihlLang} onChange={(e) => setBirkenbihlLang(e.target.value)}>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!!busy}
                onClick={async () => {
                  if (!(await confirmCost(estimateBirkenbihl(lineCount(dialog))))) return
                  await runAction('birkenbihl', async () => {
                    setIncludeRomanization(includeRomanization)
                    const { dialog: d } = await api.ai.birkenbihl(
                      dialog.id,
                      birkenbihlLang,
                      includeRomanization,
                    )
                    setDialog(d)
                  })
                }}
              >
                {busy === 'birkenbihl' ? '…' : 'Anwenden'}
              </button>
            </div>
            {needsRomanization(dialog.targetLanguage) && (
              <label className="checkbox-label tool-checkbox">
                <input
                  type="checkbox"
                  checked={includeRomanization}
                  onChange={(e) => {
                    const on = e.target.checked
                    setIncludeRomanizationState(on)
                    setIncludeRomanization(on)
                  }}
                />
                Lautschrift (lateinische Aussprache) mit erzeugen
              </label>
            )}
          </div>

          <div className="tool-group">
            <span className="tool-label">Abschnitte</span>
            <div className="tool-controls tool-controls--single">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!!busy}
                onClick={() =>
                  runAction('split', async () => {
                    const { dialog: d } = await api.ai.split(dialog.id)
                    setDialog(d)
                  })
                }
              >
                {busy === 'split' ? '…' : 'In Abschnitte teilen'}
              </button>
            </div>
          </div>

          <div className="tool-group">
            <span className="tool-label">Bilder</span>
            <div className="tool-controls tool-controls--stack">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!!busy}
                onClick={async () => {
                  if (
                    !(await confirmCost(
                      estimateAllSceneImages(dialog.sections.length),
                    ))
                  )
                    return
                  await runAction('scenes-all', async () => {
                    let current = dialog
                    let generated = 0
                    for (let si = 0; si < current.sections.length; si++) {
                      const section = current.sections[si]
                      let beatIndex = -1
                      let replan = si === 0 && !current.visualScript?.beats?.length
                      let done = false
                      while (!done) {
                        setStatus(
                          beatIndex < 0
                            ? `Abschnitt ${si + 1}/${current.sections.length}: Vorbereitung …`
                            : `Abschnitt ${si + 1}/${current.sections.length}: neues Bild ${beatIndex + 1} …`,
                        )
                        const res = await api.ai.imageLines(
                          current.id,
                          section.id,
                          beatIndex,
                          replan,
                          false,
                          beatIndex >= 0,
                        )
                        current = res.dialog
                        setDialog(res.dialog)
                        if (beatIndex < 0) {
                          if (res.prepPending) {
                            replan = false
                            await new Promise((r) => setTimeout(r, 1500))
                            continue
                          }
                          beatIndex = 0
                          replan = false
                          continue
                        }
                        generated++
                        done = res.done
                        beatIndex++
                        replan = false
                        if (!done) {
                          await new Promise((r) => setTimeout(r, 2500))
                        }
                      }
                    }
                    setStatus(
                      `Fertig – ${generated} Dialogbild${generated !== 1 ? 'er' : ''} neu erzeugt. Seite ggf. einmal hart neu laden (Strg+F5), falls der Browser noch alte Vorschaubilder zeigt.`,
                    )
                  })
                }}
              >
                {busy === 'scenes-all' ? 'Generiere …' : 'Alle Dialogbilder neu'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!!busy}
                onClick={async () => {
                  if (
                    !(await confirmCost(
                      estimateAllSectionImages(dialog.sections.length),
                    ))
                  )
                    return
                  await runAction('images', async () => {
                    let current = dialog
                    for (let i = 0; i < current.sections.length; i++) {
                      const section = current.sections[i]
                      setStatus(
                        `Generiere Titelbild ${i + 1} von ${current.sections.length} (ca. 15–30 s) …`,
                      )
                      const { dialog: d } = await api.ai.image(current.id, section.id)
                      current = d
                      setDialog(d)
                      if (i < current.sections.length - 1) {
                        await new Promise((resolve) => setTimeout(resolve, 3000))
                      }
                    }
                  })
                }}
              >
                {busy === 'images' ? 'Generiere …' : 'Alle Titelbilder'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="panel share-panel">
        <h2>Teilen</h2>
        <p className="muted share-hint">
          Erstelle einen Link für Kolleginnen und Kollegen (eingeloggt): Sie erhalten eine eigene
          Kopie, dein Original bleibt unverändert. Freigegebene Dialoge erscheinen auch unter{' '}
          <Link to="/explore">Öffentliche Dialoge</Link>. Prompt-Historie wird nicht mitkopiert.
        </p>
        {dialog.shareToken ? (
          <div className="share-active">
            <div className="share-link-row">
              <input
                className="share-link-input"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={shareBusy}
                onClick={() => void copyShareLink()}
              >
                {shareCopied ? 'Kopiert!' : 'Link kopieren'}
              </button>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-danger"
              disabled={shareBusy}
              onClick={() => void toggleSharing(false)}
            >
              Freigabe beenden
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={shareBusy || !!dialog.classId}
            onClick={() => void toggleSharing(true)}
            title={
              dialog.classId
                ? 'Klassen-Dialoge können nicht öffentlich geteilt werden'
                : undefined
            }
          >
            {shareBusy ? '…' : 'Freigabe-Link erstellen'}
          </button>
        )}
      </section>

      {dialog.sections.map((section) => (
        <section key={section.id} className="panel section-panel">
          <div className="section-header">
            <h2>{section.title}</h2>
            <div className="section-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!!busy}
                onClick={async () => {
                  if (!(await confirmCost(estimateSectionImage()))) return
                  await runAction(`img-${section.id}`, async () => {
                    setStatus('Bild wird generiert (ca. 15–30 Sekunden) …')
                    const { dialog: d } = await api.ai.image(dialog.id, section.id)
                    setDialog(d)
                  })
                }}
              >
                {busy === `img-${section.id}` ? '…' : 'Titelbild'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!!busy}
                onClick={async () => {
                  if (!(await confirmCost(estimateSceneImages(2)))) return
                  await runAction(`scenes-${section.id}`, async () => {
                    await runPictureStory(section.id)
                  })
                }}
              >
                {busy === `scenes-${section.id}` ? '…' : 'Bilder / Bilderskript (KI)'}
              </button>
            </div>
          </div>

          {section.imageUrl && (
            <img src={section.imageUrl} alt={section.title} className="section-image" />
          )}

          <div className="dialog-lines">
            {section.lines.map((line) => (
              <div key={line.id} className="dialog-line">
                <div className="dialog-line-body">
                  <strong className="speaker">{line.speaker}</strong>
                  <BirkenbihlLine
                    line={line}
                    targetLanguage={dialog.targetLanguage}
                    nativeLanguage={dialog.sourceLanguage}
                    showRomanization={includeRomanization}
                  />
                  <div className="film-line-cues">
                    <input
                      className="input"
                      defaultValue={line.cueImage ?? ''}
                      placeholder="Bild: sitzt links …"
                      disabled={!!busy}
                      onBlur={(e) => {
                        if ((e.target.value.trim() || '') !== (line.cueImage ?? '')) {
                          void saveLineCue(section.id, line.id, 'cueImage', e.target.value)
                        }
                      }}
                    />
                    <input
                      className="input"
                      defaultValue={line.cueSound ?? ''}
                      placeholder="Ton …"
                      disabled={!!busy}
                      onBlur={(e) => {
                        if ((e.target.value.trim() || '') !== (line.cueSound ?? '')) {
                          void saveLineCue(section.id, line.id, 'cueSound', e.target.value)
                        }
                      }}
                    />
                    <input
                      className="input"
                      defaultValue={line.cueSpeech ?? ''}
                      placeholder="Sprache: flüstert …"
                      disabled={!!busy}
                      onBlur={(e) => {
                        if ((e.target.value.trim() || '') !== (line.cueSpeech ?? '')) {
                          void saveLineCue(section.id, line.id, 'cueSpeech', e.target.value)
                        }
                      }}
                    />
                  </div>
                </div>
                {line.imageUrl && (
                  <img
                    src={line.imageUrl}
                    alt=""
                    className="line-thumb"
                    title="Szenen-Bild"
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {costPending && (
        <CostConfirmDialog
          estimate={costPending.estimate}
          onConfirm={() => closeCost(true)}
          onCancel={() => closeCost(false)}
        />
      )}
    </div>
  )
}
