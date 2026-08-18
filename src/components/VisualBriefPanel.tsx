import { useState } from 'react'
import type { Dialog, VisualQuestion } from '../types'

type Props = {
  dialog: Dialog
  questions: VisualQuestion[]
  askQuestions: boolean
  onAskQuestionsChange: (on: boolean) => void
  busy: boolean
  onAnswer: (answers: Record<string, string>) => void
  onApproveTest: () => void
  onCommentTest: (comment: string) => void
}

export function VisualBriefPanel({
  dialog,
  questions,
  askQuestions,
  onAskQuestionsChange,
  busy,
  onAnswer,
  onApproveTest,
  onCommentTest,
}: Props) {
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [comment, setComment] = useState('')
  const brief = dialog.visualBrief
  const showTest = Boolean(brief?.testImageUrl) && !brief?.testApproved

  return (
    <div className="visual-brief-panel">
      <label className="checkbox-label visual-brief-ask">
        <input
          type="checkbox"
          checked={askQuestions}
          disabled={busy}
          onChange={(e) => onAskQuestionsChange(e.target.checked)}
        />
        <span>Vor den Bildern nachfragen (Stil, Alter, Bildergeschichte)</span>
      </label>

      {questions.length > 0 && (
        <div className="visual-brief-questions">
          <p className="visual-brief-lead">
            Damit die Bilder zur Geschichte passen, ein paar kurze Fragen:
          </p>
          {questions.map((q) => (
            <fieldset key={q.id} className="visual-brief-q">
              <legend>{q.question}</legend>
              {q.options.map((opt) => (
                <label key={opt.id} className="checkbox-label">
                  <input
                    type="radio"
                    name={`vq-${q.id}`}
                    checked={picks[q.id] === opt.id}
                    onChange={() => setPicks((p) => ({ ...p, [q.id]: opt.id }))}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </fieldset>
          ))}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || questions.some((q) => !picks[q.id])}
            onClick={() => onAnswer(picks)}
          >
            Weiter
          </button>
        </div>
      )}

      {showTest && brief?.testImageUrl && (
        <div className="visual-brief-test">
          <p className="visual-brief-lead">
            Testbild — stimmen Stil, Alter und Szene? Wenn ja, die restlichen Bilder danach.
          </p>
          <img src={brief.testImageUrl} alt="Testbild" className="visual-brief-test-img" />
          <textarea
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="z.B. Zu alt, bitte 15-Jährige. Prospekt muss sichtbar sein. Zeichnung, kein Foto."
          />
          <div className="visual-brief-test-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy || !comment.trim()}
              onClick={() => {
                onCommentTest(comment.trim())
                setComment('')
              }}
            >
              Mit Anmerkung neu
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => onApproveTest()}
            >
              Passt — Bilder erzeugen
            </button>
          </div>
        </div>
      )}

      {brief?.testApproved && (
        <p className="muted visual-brief-ok">
          Testbild bestätigt ({brief.artStyle}
          {brief.ageEn ? ` · ${brief.ageEn}` : ''}).
        </p>
      )}
    </div>
  )
}
