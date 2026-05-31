import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BirkenbihlLine } from '../components/BirkenbihlLine'
import { buildSpeakerIndexMap, useSpeechReader } from '../hooks/useSpeechReader'
import { api } from '../api/client'
import type { Dialog, DialogSection } from '../types'

export function SlideshowPage() {
  const { id } = useParams<{ id: string }>()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [slideIndex, setSlideIndex] = useState(0)
  const [lineIndex, setLineIndex] = useState(0)
  const [rate, setRate] = useState(0.85)
  const [highlightWords, setHighlightWords] = useState(true)
  const [loading, setLoading] = useState(true)

  const { speakFrom, stop, speaking, activeLineId, highlightIndex } = useSpeechReader(
    dialog?.targetLanguage ?? 'en',
  )

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
    setLineIndex(0)
  }, [slideIndex])

  const section: DialogSection | undefined = dialog?.sections[slideIndex]

  const previewLines = section?.lines.slice(lineIndex, lineIndex + 2) ?? []
  const atSectionEnd = section ? lineIndex >= section.lines.length : true

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

      <div className="slideshow-stage">
        <div className="slideshow-image-wrap">
          {section.imageUrl ? (
            <img src={section.imageUrl} alt={section.title} className="slideshow-image" />
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
