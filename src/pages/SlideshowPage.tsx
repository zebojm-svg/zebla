import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BirkenbihlLine } from '../components/BirkenbihlLine'
import { SlideshowKenBurnsImage } from '../components/SlideshowKenBurnsImage'
import { buildSpeakerIndexMap, useSpeechReader } from '../hooks/useSpeechReader'
import { api } from '../api/client'
import type { Dialog, DialogSection } from '../types'
import { languageName, needsRomanization } from '../types'
import {
  getIncludeRomanization,
  getUseCloudTts,
  setIncludeRomanization,
  setUseCloudTts,
} from '../lib/preferences'
import { CostConfirmDialog } from '../components/CostConfirmDialog'
import { useCostConfirm } from '../hooks/useCostConfirm'
import { estimateMissingTts } from '../lib/costEstimates'
import { lineSpeechText, speechTextDiffersFromLineText } from '../../shared/line-speech'

export function SlideshowPage() {
  const { id } = useParams<{ id: string }>()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [slideIndex, setSlideIndex] = useState(0)
  const [lineIndex, setLineIndex] = useState(0)
  const [rate, setRate] = useState(0.85)
  const [highlightWords, setHighlightWords] = useState(true)
  const [loading, setLoading] = useState(true)
  const [ttsHint, setTtsHint] = useState('')
  const [audioBusy, setAudioBusy] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportStatus, setExportStatus] = useState('')
  const [audioStatus, setAudioStatus] = useState('')
  const [useCloudTts, setUseCloudTtsState] = useState(true)
  const [showRomanization, setShowRomanizationState] = useState(true)
  const { pending: costPending, confirm: confirmCost, close: closeCost } = useCostConfirm()

  const { speakFrom, stop, speaking, activeLineId, highlightIndex, cloudTtsReady, ttsError } =
    useSpeechReader(dialog?.targetLanguage ?? 'en', dialog?.id, setDialog, { useCloudTts })

  useEffect(() => {
    if (!id) return
    api.dialogs
      .get(id)
      .then(({ dialog: d }) => setDialog(d))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    return () => stop()
  }, [stop])

  useEffect(() => {
    if (!dialog) return
    setUseCloudTtsState(getUseCloudTts(dialog.targetLanguage))
    setShowRomanizationState(getIncludeRomanization())
  }, [dialog?.id, dialog?.targetLanguage])

  useEffect(() => {
    if (!dialog || useCloudTts || !['fa', 'ar'].includes(dialog.targetLanguage)) {
      setTtsHint('')
      return
    }
    if (cloudTtsReady || ttsError) {
      setTtsHint('')
      return
    }
    const checkVoices = () => {
      const prefix = dialog.targetLanguage
      const matched = window.speechSynthesis
        .getVoices()
        .filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(prefix))
      if (matched.length === 0) {
        setTtsHint(
          `Keine Sprachausgabe-Stimme für ${languageName(prefix)} gefunden. Unter Windows: Einstellungen → Zeit und Sprache → Sprache → Sprachpaket mit „Sprachausgabe“ installieren, Browser neu starten.`,
        )
      } else {
        setTtsHint('')
      }
    }
    checkVoices()
    window.speechSynthesis.onvoiceschanged = checkVoices
    const timer = window.setTimeout(checkVoices, 500)
    return () => {
      window.speechSynthesis.onvoiceschanged = null
      window.clearTimeout(timer)
    }
  }, [dialog, cloudTtsReady, ttsError, useCloudTts])

  useEffect(() => {
    setLineIndex(0)
  }, [slideIndex])

  const section: DialogSection | undefined = dialog?.sections[slideIndex]

  const previewLines = section?.lines.slice(lineIndex, lineIndex + 2) ?? []
  const atSectionEnd = section ? lineIndex >= section.lines.length : true

  const displayLine =
    section?.lines.find((l) => l.id === activeLineId) ??
    section?.lines[lineIndex]
  const displayImageUrl = displayLine?.imageUrl ?? section?.imageUrl

  const playContinuous = async (fromSection: number, fromLine: number) => {
    if (!dialog) return
    for (let si = fromSection; si < dialog.sections.length; si++) {
      const sec = dialog.sections[si]
      const map = buildSpeakerIndexMap(sec.lines)
      const startLi = si === fromSection ? fromLine : 0
      setSlideIndex(si)
      setLineIndex(startLi)
      const stopped = await speakFrom(
        sec.lines,
        map,
        startLi,
        rate,
        highlightWords,
        setLineIndex,
      )
      if (stopped) break
    }
  }

  const goPrev = () => {
    stop()
    if (!dialog || !section) return
    if (lineIndex > 0) {
      setLineIndex((i) => i - 1)
      return
    }
    if (slideIndex > 0) {
      const prev = dialog.sections[slideIndex - 1]
      setSlideIndex((i) => i - 1)
      setLineIndex(Math.max(0, prev.lines.length - 1))
    }
  }

  const goNext = () => {
    stop()
    if (!dialog || !section) return
    if (lineIndex < section.lines.length - 1) {
      setLineIndex((i) => i + 1)
      return
    }
    if (slideIndex < dialog.sections.length - 1) {
      setSlideIndex((i) => i + 1)
      setLineIndex(0)
    }
  }

  const canGoPrev = slideIndex > 0 || lineIndex > 0
  const canGoNext =
    dialog &&
    section &&
    (lineIndex < section.lines.length - 1 || slideIndex < dialog.sections.length - 1)

  const allLines = dialog?.sections.flatMap((s) => s.lines) ?? []
  const lineNeedsAudio = (l: (typeof allLines)[number]) =>
    Boolean(lineSpeechText(l)) && (!l.audioUrl || speechTextDiffersFromLineText(l))
  const audioReadyCount = allLines.filter(
    (l) => l.audioUrl && !speechTextDiffersFromLineText(l),
  ).length
  const exportError = useMemo(() => {
    if (!dialog) return null
    const lines = dialog.sections.flatMap((s) => s.lines).filter((l) => lineSpeechText(l))
    if (lines.length === 0) return 'Keine Zeilen.'
    const missing = lines.filter((l) => lineNeedsAudio(l)).length
    if (missing > 0) {
      return `${missing} Zeile${missing !== 1 ? 'n' : ''} ohne Audio — zuerst „Audio vorbereiten“.`
    }
    return null
  }, [dialog])

  const handleEnsureAudio = async () => {
    if (!dialog || !cloudTtsReady) return
    const missing = allLines.filter((l) => lineNeedsAudio(l)).length
    if (missing === 0) {
      setAudioStatus('Alle Zeilen haben bereits gespeichertes Audio – Abspielen kostet nichts.')
      return
    }
    if (!(await confirmCost(estimateMissingTts(dialog)))) return
    setAudioBusy(true)
    setAudioStatus('')
    try {
      const { dialog: updated, generated, skipped } = await api.tts.ensureAll(dialog.id, rate)
      setDialog(updated)
      setAudioStatus(
        generated > 0
          ? `${generated} neue Audiodatei${generated !== 1 ? 'n' : ''} erstellt (${skipped} bereits vorhanden).`
          : `Alle ${skipped} Zeilen hatten bereits Audio.`,
      )
    } catch (err) {
      setAudioStatus(err instanceof Error ? err.message : 'Audio-Vorbereitung fehlgeschlagen')
    } finally {
      setAudioBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="slideshow-page page-center">
        <p className="muted">Lade Diashow …</p>
      </div>
    )
  }

  if (!dialog || dialog.sections.length === 0 || !section) {
    return (
      <div className="slideshow-page page-center">
        <p>Kein Dialog vorhanden.</p>
        <Link to="/">Zurück</Link>
      </div>
    )
  }

  return (
    <div className="slideshow-page">
      <div className="slideshow-topbar">
        <Link to={`/dialog/${dialog.id}`} className="btn btn-ghost slideshow-back">
          ← Bearbeiten
        </Link>
        <span className="slideshow-title">{dialog.title}</span>
        <span className="slideshow-counter">
          Abschnitt {slideIndex + 1}/{dialog.sections.length}
        </span>
      </div>

      {ttsHint && <div className="alert alert-warn slideshow-tts-hint">{ttsHint}</div>}
      <div className="slideshow-settings panel">
        <label className="checkbox-label slideshow-setting">
          <input
            type="checkbox"
            checked={useCloudTts}
            onChange={(e) => {
              const on = e.target.checked
              setUseCloudTtsState(on)
              setUseCloudTts(on)
            }}
          />
          <span>
            ☁️ Cloud-Sprachausgabe{' '}
            <span className="muted slideshow-setting-hint">
              (kostenpflichtig, ca. 1 Cent / 5 Zeilen; wird einmal gespeichert)
            </span>
          </span>
        </label>
        {needsRomanization(dialog.targetLanguage) && (
          <label className="checkbox-label slideshow-setting">
            <input
              type="checkbox"
              checked={showRomanization}
              onChange={(e) => {
                const on = e.target.checked
                setShowRomanizationState(on)
                setIncludeRomanization(on)
              }}
            />
            <span>Lautschrift (lateinische Aussprache unter jedem Wort)</span>
          </label>
        )}
        {!useCloudTts && (
          <p className="muted slideshow-setting-note">
            🖥️ Windows-Sprachausgabe (gratis). Bei Persisch/Arabisch ggf. Sprachpaket in den
            Windows-Einstellungen installieren.
          </p>
        )}
      </div>

      {useCloudTts && ttsError && (
        <div className="alert alert-error slideshow-tts-hint">
          {ttsError}
          {(ttsError.includes('Vertex AI User') || ttsError.includes('Service-Account')) && (
            <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              <a
                href="https://console.cloud.google.com/iam-admin/iam?project=zebla-f517e"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'inherit' }}
              >
                IAM: Rolle „Vertex AI User“ vergeben →
              </a>
            </p>
          )}
          {ttsError.includes('Vertex AI') &&
            !ttsError.includes('Vertex AI User') &&
            !ttsError.includes('Service-Account') && (
              <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                <a
                  href="https://console.cloud.google.com/apis/library/aiplatform.googleapis.com?project=zebla-f517e"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'inherit' }}
                >
                  Vertex AI API aktivieren →
                </a>
              </p>
            )}
        </div>
      )}
      {useCloudTts && cloudTtsReady && !ttsError && (
        <div className="slideshow-cloud-tts">
          ☁️ Cloud-Sprachausgabe
          {dialog.targetLanguage.startsWith('fa') ? ' (Gemini)' : ' (Google)'}
          {audioReadyCount > 0 && (
            <span className="slideshow-audio-count">
              {' '}
              · {audioReadyCount}/{allLines.length} Zeilen gespeichert — Wiedergabe ohne neue KI-Kosten
            </span>
          )}
        </div>
      )}

      {audioStatus && <div className="alert alert-warn slideshow-tts-hint">{audioStatus}</div>}

      {useCloudTts && cloudTtsReady && !ttsError && (
        <div className="slideshow-export-block">
          <div className="slideshow-export-bar">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={audioBusy || speaking || exportBusy}
              onClick={() => void handleEnsureAudio()}
            >
              {audioBusy ? 'Erzeuge Audio …' : 'Audio vorbereiten'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={exportBusy || speaking || !!exportError}
              title={exportError ?? undefined}
              onClick={async () => {
                setExportBusy(true)
                setExportStatus('')
                setAudioStatus('')
                try {
                  const { exportDialogMp3 } = await import('../utils/exportDialogMedia')
                  await exportDialogMp3(dialog, {
                    rate,
                    showRomanization,
                    targetLanguage: dialog.targetLanguage,
                    nativeLanguage: dialog.sourceLanguage,
                    onProgress: setExportStatus,
                  })
                } catch (err) {
                  setAudioStatus(err instanceof Error ? err.message : 'MP3-Export fehlgeschlagen')
                } finally {
                  setExportBusy(false)
                  setExportStatus('')
                }
              }}
            >
              Export als MP3
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={exportBusy || speaking || !!exportError}
              title={exportError ?? undefined}
              onClick={async () => {
                setExportBusy(true)
                setExportStatus('')
                setAudioStatus('')
                try {
                  const { exportDialogMp4 } = await import('../utils/exportDialogMedia')
                  await exportDialogMp4(dialog, {
                    rate,
                    showRomanization,
                    targetLanguage: dialog.targetLanguage,
                    nativeLanguage: dialog.sourceLanguage,
                    onProgress: setExportStatus,
                  })
                } catch (err) {
                  setAudioStatus(err instanceof Error ? err.message : 'MP4-Export fehlgeschlagen')
                } finally {
                  setExportBusy(false)
                  setExportStatus('')
                }
              }}
            >
              Export als MP4
            </button>
          </div>
          <p className="muted slideshow-export-info">
            Export mit aktueller Geschwindigkeit ({rate.toFixed(2)}×). MP4 = Bilder + Text + Sprache
            wie in der Diashow. MP3 = nur Audio.
          </p>
          {exportStatus && (
            <p className="muted slideshow-export-info">{exportStatus}</p>
          )}
        </div>
      )}

      {costPending && (
        <CostConfirmDialog
          estimate={costPending.estimate}
          busy={audioBusy}
          onConfirm={() => closeCost(true)}
          onCancel={() => closeCost(false)}
        />
      )}

      <div className="slideshow-stage">
        <div className="slideshow-image-wrap">
          {displayImageUrl && displayLine ? (
            <SlideshowKenBurnsImage
              imageUrl={displayImageUrl}
              speaker={displayLine.speaker}
              lineText={displayLine.text}
              rate={rate}
              animate={speaking && activeLineId === displayLine.id}
            />
          ) : (
            <div className="slideshow-image-placeholder">
              <p>{section.title}</p>
            </div>
          )}
        </div>

        <div className="slideshow-preview">
          {atSectionEnd ? (
            <p className="slideshow-done-hint">
              {slideIndex < dialog.sections.length - 1
                ? 'Abschnitt zu Ende — weiter für nächsten Abschnitt.'
                : 'Dialog zu Ende.'}
            </p>
          ) : (
            previewLines.map((line) => (
              <div
                key={line.id}
                className={`slideshow-preview-line ${activeLineId === line.id ? 'is-active' : ''}`}
              >
                <strong>{line.speaker}</strong>
                <BirkenbihlLine
                  line={line}
                  highlightWordIndex={
                    speaking && activeLineId === line.id ? highlightIndex : null
                  }
                  targetLanguage={dialog.targetLanguage}
                  nativeLanguage={dialog.sourceLanguage}
                  showRomanization={showRomanization}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <div className="slideshow-controls">
        <button
          type="button"
          className="btn btn-secondary slideshow-nav-btn"
          disabled={!canGoPrev}
          onClick={goPrev}
          aria-label="Zurück"
        >
          ←
        </button>

        <div className="slideshow-playback">
          {speaking ? (
            <button
              type="button"
              className="btn btn-primary slideshow-play-btn"
              onClick={stop}
              aria-label="Pause"
            >
              ⏸
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary slideshow-play-btn"
              onClick={() => {
                if (atSectionEnd && slideIndex < dialog.sections.length - 1) {
                  setSlideIndex((i) => i + 1)
                  setLineIndex(0)
                  void playContinuous(slideIndex + 1, 0)
                } else {
                  void playContinuous(slideIndex, lineIndex)
                }
              }}
              disabled={atSectionEnd && slideIndex >= dialog.sections.length - 1}
              aria-label="Abspielen"
            >
              ▶
            </button>
          )}

          <label className="slideshow-rate">
            <span>🐢</span>
            <input
              type="range"
              min={0.4}
              max={1.3}
              step={0.05}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
            />
            <span className="slideshow-rate-value">{rate.toFixed(2)}×</span>
          </label>

          <label className="checkbox-label slideshow-checkbox">
            <input
              type="checkbox"
              checked={highlightWords}
              onChange={(e) => setHighlightWords(e.target.checked)}
            />
            Wörter markieren
          </label>
        </div>

        <button
          type="button"
          className="btn btn-secondary slideshow-nav-btn"
          disabled={!canGoNext}
          onClick={goNext}
          aria-label="Weiter"
        >
          →
        </button>
      </div>
    </div>
  )
}
