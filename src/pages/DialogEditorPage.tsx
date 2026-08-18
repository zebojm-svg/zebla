import { useEffect, useState } from 'react'
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
import type { Dialog, VisualQuestion } from '../types'

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
  const [askVisualQuestions, setAskVisualQuestionsState] = useState(true)
  const [visualQuestions, setVisualQuestions] = useState<VisualQuestion[]>([])
  const [pendingSectionId, setPendingSectionId] = useState<string | null>(null)
  const { pending: costPending, confirm: confirmCost, close: closeCost } = useCostConfirm()

  const reload = async () => {
    if (!id) return
    const { dialog: d } = await api.dialogs.get(id)
    setDialog(d)
    setTranslateLang(d.targetLanguage)
    setBirkenbihlLang(d.sourceLanguage)
    setIncludeRomanizationState(getIncludeRomanization())
    setImageDirectionDraft(d.imageDirection ?? '')
    setAskVisualQuestionsState(getAskVisualQuestions())
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof Error ? err.message : 'Fehler'))
      .finally(() => setLoading(false))
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

  return (
    <div className="editor-page">
      <div className="page-header">
        <div>
          <h1>{dialog.title}</h1>
          <p className="muted">
            <span className="dialog-lang-flag-inline" aria-hidden>
              <LanguageFlag code={dialog.targetLanguage} size="md" />
            </span>{' '}
            {languageName(dialog.targetLanguage)} · {dialog.sections.length} Abschnitt
            {dialog.sections.length !== 1 ? 'e' : ''}
          </p>
        </div>
        <Link to={`/dialog/${dialog.id}/slideshow`} className="btn btn-primary">
          {t('editor.slideshow')}
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {status && <div className="alert alert-warn">{status}</div>}

      <section className="panel dialog-meta-panel">
        <h2>Dialog-Auftrag &amp; Bilder</h2>
        {formatCreationPromptForDisplay(dialog) && (
          <div className="dialog-meta-block">
            <h3 className="dialog-meta-label">Ursprüngliche Eingabe</h3>
            <pre className="dialog-meta-pre">{formatCreationPromptForDisplay(dialog)}</pre>
          </div>
        )}
        <label className="dialog-meta-block">
          <span className="dialog-meta-label">Bild-Hinweise für die KI</span>
          <textarea
            rows={4}
            value={imageDirectionDraft}
            onChange={(e) => setImageDirectionDraft(e.target.value)}
            placeholder="Setting, Figuren, Emotionen pro Stelle (z.B. lachen, schluchzen, weinen), Licht …"
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!!busy}
            onClick={() =>
              void runAction('image-direction', async () => {
                const { dialog: d } = await api.dialogs.update(dialog.id, {
                  imageDirection: imageDirectionDraft.trim(),
                  visualBrief: null,
                })
                setDialog(d)
                setStatus('Bild-Hinweise gespeichert. Beim nächsten „Bilder / Bilderskript (KI)“ werden sie berücksichtigt.')
              })
            }
          >
            {busy === 'image-direction' ? '…' : 'Bild-Hinweise speichern'}
          </button>
          <p className="muted dialog-meta-hint">
            Emotionen wie lachen, weinen oder schluchzen kannst du hier oder im Dialogtext beschreiben – die KI
            plant passende Gesichtsausdrücke. Speichern setzt die Bild-Regie zurück (neues Testbild).
          </p>
        </label>

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
