import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BirkenbihlLine } from '../components/BirkenbihlLine'
import { SlideshowKenBurnsImage } from '../components/SlideshowKenBurnsImage'
import { SlideshowVoicePanel } from '../components/SlideshowVoicePanel'
import { PinchZoomSurface } from '../components/PinchZoomSurface'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { buildSpeakerIndexMap, useSpeechReader } from '../hooks/useSpeechReader'
import { api } from '../api/client'
import type { Dialog, DialogSection } from '../types'
import { languageName, needsRomanization } from '../types'
import {
  getIncludeRomanization,
  getShowTargetText,
  getShowTranslation,
  getUseCloudTts,
  setIncludeRomanization,
  setShowTargetText,
  setShowTranslation,
  setUseCloudTts,
} from '../lib/preferences'
import { CostConfirmDialog } from '../components/CostConfirmDialog'
import { useCostConfirm } from '../hooks/useCostConfirm'
import { estimateMissingTts, estimateRegenerateTts } from '../lib/costEstimates'
import { exportDialogJson, exportDialogText } from '../utils/exportDialog'
import { lineSpeechText, speechTextDiffersFromLineText } from '../../shared/line-speech'
import { useI18n } from '../i18n/I18nContext'

export function SlideshowPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useI18n()
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
  const [showTargetText, setShowTargetTextState] = useState(true)
  const [showRomanization, setShowRomanizationState] = useState(true)
  const [showTranslation, setShowTranslationState] = useState(true)
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
    setShowTargetTextState(getShowTargetText())
    setShowRomanizationState(getIncludeRomanization())
    setShowTranslationState(getShowTranslation())
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
  const lastSection = dialog?.sections[dialog.sections.length - 1]
  const lastLineOfDialog = lastSection?.lines[lastSection.lines.length - 1]
  const atSectionEnd = section ? lineIndex >= section.lines.length : true
  const dialogFinished =
    !!dialog &&
    dialog.sections.length > 0 &&
    slideIndex >= dialog.sections.length - 1 &&
    atSectionEnd

  const previewLines = dialogFinished && lastLineOfDialog
    ? [lastLineOfDialog]
    : atSectionEnd && slideIndex < (dialog?.sections.length ?? 1) - 1
      ? []
      : (section?.lines.slice(lineIndex, lineIndex + 1) ?? [])

  const displayLine = dialogFinished && lastLineOfDialog
    ? lastLineOfDialog
    : (section?.lines.find((l) => l.id === activeLineId) ?? section?.lines[lineIndex])
  const displayImageUrl =
    displayLine?.imageUrl ?? section?.imageUrl ?? lastSection?.imageUrl

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

  const goToStart = () => {
    stop()
    setSlideIndex(0)
    setLineIndex(0)
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
  const hasStoredAudio = allLines.some((l) => l.audioUrl)
  const exportError = useMemo(() => {
    if (!dialog) return null
    const lines = dialog.sections.flatMap((s) => s.lines).filter((l) => lineSpeechText(l))
    if (lines.length === 0) return t('slideshow.noLines')
    const missing = lines.filter((l) => lineNeedsAudio(l)).length
    if (missing > 0) {
      return t('slideshow.missingAudio', { count: missing })
    }
    return null
  }, [dialog, t])

  const scriptDisplayOptions = {
    showTargetText,
    showRomanization,
    showTranslation,
  }

  const runEnsureAudio = async (force: boolean) => {
    if (!dialog || !cloudTtsReady) return
    setAudioBusy(true)
    setAudioStatus('')
    try {
      const { dialog: updated, generated, skipped } = await api.tts.ensureAll(
        dialog.id,
        rate,
        { force },
      )
      setDialog(updated)
      setAudioStatus(
        force
          ? `${generated} Audiodatei${generated !== 1 ? 'en' : ''} neu erstellt.`
          : generated > 0
            ? `${generated} neue Audiodatei${generated !== 1 ? 'n' : ''} erstellt (${skipped} bereits vorhanden).`
            : `Alle ${skipped} Zeilen hatten bereits Audio.`,
      )
    } catch (err) {
      setAudioStatus(err instanceof Error ? err.message : 'Audio-Vorbereitung fehlgeschlagen')
    } finally {
      setAudioBusy(false)
    }
  }

  const handleEnsureAudio = async () => {
    if (!dialog || !cloudTtsReady) return
    const missing = allLines.filter((l) => lineNeedsAudio(l)).length
    if (missing === 0) {
      setAudioStatus('Alle Zeilen haben bereits gespeichertes Audio – Abspielen kostet nichts.')
      return
    }
    if (!(await confirmCost(estimateMissingTts(dialog)))) return
    await runEnsureAudio(false)
  }

  const handleRegenerateAudio = async () => {
    if (!dialog || !cloudTtsReady) return
    const withSpeech = allLines.filter((l) => lineSpeechText(l)).length
    if (withSpeech === 0) return
    if (!(await confirmCost(estimateRegenerateTts(dialog)))) return
    await runEnsureAudio(true)
  }

  if (loading) {
    return (
      <div className="slideshow-page page-center">
        <p className="muted">{t('common.loading')}</p>
      </div>
    )
  }

  if (!dialog || dialog.sections.length === 0 || !section) {
    return (
      <div className="slideshow-page page-center">
        <p>{t('slideshow.noDialog')}</p>
        <Link to="/">{t('nav.back')}</Link>
      </div>
    )
  }

  return (
    <div className="slideshow-page">
      <div className="slideshow-topbar">
        <Link to={`/dialog/${dialog.id}`} className="btn btn-ghost slideshow-back">
          {t('nav.edit')}
        </Link>
        <span className="slideshow-title">{dialog.title}</span>
        <div className="slideshow-topbar-end">
          <LanguageSwitcher className="lang-switcher--slideshow" />
          <span className="slideshow-counter">
            {t('slideshow.section', {
              current: slideIndex + 1,
              total: dialog.sections.length,
            })}
          </span>
        </div>
      </div>

      {ttsHint && <div className="alert alert-warn slideshow-tts-hint">{ttsHint}</div>}

      <details className="slideshow-tools panel">
        <summary className="slideshow-tools-summary">{t('slideshow.tools')}</summary>
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
            {t('slideshow.cloudTts')}{' '}
            <span className="muted slideshow-setting-hint">
              {t('slideshow.cloudTtsHint')}
            </span>
          </span>
        </label>
        <fieldset className="slideshow-script-toggles">
          <legend>{t('slideshow.displayScripts')}</legend>
          <label className="checkbox-label slideshow-setting">
            <input
              type="checkbox"
              checked={showTargetText}
              onChange={(e) => {
                const on = e.target.checked
                setShowTargetTextState(on)
                setShowTargetText(on)
              }}
            />
            <span>
              {t('slideshow.showTarget', { lang: languageName(dialog.targetLanguage) })}
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
              <span>{t('slideshow.showRomanization')}</span>
            </label>
          )}
          <label className="checkbox-label slideshow-setting">
            <input
              type="checkbox"
              checked={showTranslation}
              onChange={(e) => {
                const on = e.target.checked
                setShowTranslationState(on)
                setShowTranslation(on)
              }}
            />
            <span>
              {t('slideshow.showTranslation', {
                lang: languageName(dialog.sourceLanguage),
              })}
            </span>
          </label>
        </fieldset>
        {!useCloudTts && (
          <p className="muted slideshow-setting-note">{t('slideshow.windowsTts')}</p>
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
          {t('slideshow.cloudTts')}
          {dialog.targetLanguage.startsWith('fa') ? ' (Gemini)' : ' (Google)'}
          {audioReadyCount > 0 && (
            <span className="slideshow-audio-count">
              {' '}
              {t('slideshow.audioReady', {
                ready: audioReadyCount,
                total: allLines.length,
              })}
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
              {audioBusy ? t('slideshow.audioBusy') : t('slideshow.prepareAudio')}
            </button>
            {hasStoredAudio && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={audioBusy || speaking || exportBusy}
                onClick={() => void handleRegenerateAudio()}
                title={t('slideshow.regenerateAudio')}
              >
                {audioBusy ? t('slideshow.audioBusy') : t('slideshow.regenerateAudio')}
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={exportBusy || speaking}
              onClick={() => exportDialogText(dialog)}
            >
              {t('slideshow.exportTxt')}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={exportBusy || speaking}
              onClick={() => exportDialogJson(dialog)}
            >
              {t('slideshow.exportJson')}
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
                    ...scriptDisplayOptions,
                    targetLanguage: dialog.targetLanguage,
                    nativeLanguage: dialog.sourceLanguage,
                    onProgress: setExportStatus,
                  })
                } catch (err) {
                  setAudioStatus(err instanceof Error ? err.message : t('common.error'))
                } finally {
                  setExportBusy(false)
                  setExportStatus('')
                }
              }}
            >
              {t('slideshow.exportMp3')}
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
                    ...scriptDisplayOptions,
                    targetLanguage: dialog.targetLanguage,
                    nativeLanguage: dialog.sourceLanguage,
                    onProgress: setExportStatus,
                  })
                } catch (err) {
                  setAudioStatus(err instanceof Error ? err.message : t('common.error'))
                } finally {
                  setExportBusy(false)
                  setExportStatus('')
                }
              }}
            >
              {t('slideshow.exportMp4')}
            </button>
          </div>
          <p className="muted slideshow-export-info">
            {t('slideshow.exportInfo', { rate: rate.toFixed(2) })}
          </p>
          {exportStatus && (
            <p className="muted slideshow-export-info">{exportStatus}</p>
          )}
        </div>
      )}

      {useCloudTts && cloudTtsReady && !ttsError && (
        <SlideshowVoicePanel
          dialog={dialog}
          setDialog={setDialog}
          disabled={audioBusy || speaking || exportBusy}
          onStatus={setAudioStatus}
        />
      )}
      </details>

      {costPending && (
        <CostConfirmDialog
          estimate={costPending.estimate}
          onConfirm={() => closeCost(true)}
          onCancel={() => closeCost(false)}
        />
      )}

      <p className="muted slideshow-zoom-hint">{t('slideshow.zoomHint')}</p>

      <div className="slideshow-stage">
        <div className="slideshow-image-wrap">
          <PinchZoomSurface className="slideshow-image-zoom">
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
          </PinchZoomSurface>
        </div>

        <PinchZoomSurface className="slideshow-preview">
          {atSectionEnd && !dialogFinished ? (
            <p className="slideshow-done-hint">{t('slideshow.sectionEnd')}</p>
          ) : previewLines.length > 0 ? (
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
                  showTargetText={showTargetText}
                  showRomanization={showRomanization}
                  showTranslation={showTranslation}
                />
              </div>
            ))
          ) : null}
        </PinchZoomSurface>
      </div>

      <div className="slideshow-controls slideshow-controls--dock">
        <div className="slideshow-nav-row">
          <button
            type="button"
            className="btn btn-secondary slideshow-nav-btn"
            onClick={goToStart}
            aria-label={t('slideshow.start')}
            title={t('slideshow.start')}
          >
            ⏮
          </button>
          <button
            type="button"
            className="btn btn-secondary slideshow-nav-btn"
            disabled={!canGoPrev}
            onClick={goPrev}
            aria-label={t('slideshow.prev')}
          >
            ←
          </button>
          {speaking ? (
            <button
              type="button"
              className="btn btn-primary slideshow-play-btn"
              onClick={stop}
              aria-label={t('slideshow.pause')}
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
              aria-label={t('slideshow.play')}
            >
              ▶
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary slideshow-nav-btn"
            disabled={!canGoNext}
            onClick={goNext}
            aria-label={t('slideshow.next')}
          >
            →
          </button>
        </div>
        <div className="slideshow-playback-row">
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
            {t('slideshow.words')}
          </label>
        </div>
      </div>
    </div>
  )
}
