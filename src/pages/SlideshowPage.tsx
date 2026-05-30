import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { BirkenbihlLine } from '../components/BirkenbihlLine'
import { SPEECH_RATES, useSpeechReader } from '../hooks/useSpeechReader'
import type { Dialog, DialogSection } from '../types'

export function SlideshowPage() {
  const { id } = useParams<{ id: string }>()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [slideIndex, setSlideIndex] = useState(0)
  const [rate, setRate] = useState(0.85)
  const [highlightWords, setHighlightWords] = useState(true)
  const [loading, setLoading] = useState(true)

  const { speakLines, speakSingle, stop, speaking, activeLineId, highlightIndex } =
    useSpeechReader(dialog?.targetLanguage ?? 'en')

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

  if (loading) {
    return (
      <div className="slideshow-page page-center">
        <p className="muted">Lade Diashow …</p>
      </div>
    )
  }

  if (!dialog || dialog.sections.length === 0) {
    return (
      <div className="slideshow-page page-center">
        <p>Kein Dialog vorhanden.</p>
        <Link to="/">Zurück</Link>
      </div>
    )
  }

  const section: DialogSection = dialog.sections[slideIndex]

  const readSection = () => {
    speakLines(section.lines, rate, highlightWords)
  }

  const readLine = (lineId: string, text: string) => {
    speakSingle(text, lineId, rate, highlightWords)
  }

  return (
    <div className="slideshow-page">
      <div className="slideshow-topbar">
        <Link to={`/dialog/${dialog.id}`} className="btn btn-ghost slideshow-back">
          ← Bearbeiten
        </Link>
        <span className="slideshow-title">{dialog.title}</span>
        <span className="slideshow-counter">
          {slideIndex + 1} / {dialog.sections.length}
        </span>
      </div>

      <div className="slideshow-content">
        {section.imageUrl && (
          <img src={section.imageUrl} alt={section.title} className="slideshow-image" />
        )}
        <h2 className="slideshow-section-title">{section.title}</h2>

        <div className="slideshow-lines">
          {section.lines.map((line) => (
            <div key={line.id} className="slideshow-line">
              <div className="slideshow-line-header">
                <strong>{line.speaker}</strong>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => readLine(line.id, line.text)}
                  disabled={speaking}
                >
                  Zeile vorlesen
                </button>
              </div>
              <BirkenbihlLine
                line={line}
                highlightWordIndex={
                  speaking && activeLineId === line.id ? highlightIndex : null
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="slideshow-controls">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={slideIndex === 0}
          onClick={() => {
            stop()
            setSlideIndex((i) => i - 1)
          }}
        >
          ← Zurück
        </button>

        <div className="slideshow-playback">
          <label>
            Geschwindigkeit
            <select
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
            >
              {SPEECH_RATES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={highlightWords}
              onChange={(e) => setHighlightWords(e.target.checked)}
            />
            Wörter markieren
          </label>
          {speaking ? (
            <button type="button" className="btn btn-primary" onClick={stop}>
              Stoppen
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={readSection}>
              Abschnitt vorlesen
            </button>
          )}
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          disabled={slideIndex >= dialog.sections.length - 1}
          onClick={() => {
            stop()
            setSlideIndex((i) => i + 1)
          }}
        >
          Weiter →
        </button>
      </div>
    </div>
  )
}
