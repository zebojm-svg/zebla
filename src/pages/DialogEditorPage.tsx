import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { BirkenbihlLine } from '../components/BirkenbihlLine'
import type { Dialog } from '../types'
import { LANGUAGES, languageName } from '../types'

export function DialogEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [translateLang, setTranslateLang] = useState('en')
  const [birkenbihlLang, setBirkenbihlLang] = useState('de')

  const reload = async () => {
    if (!id) return
    const { dialog: d } = await api.dialogs.get(id)
    setDialog(d)
    setTranslateLang(d.targetLanguage)
    setBirkenbihlLang(d.sourceLanguage)
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof Error ? err.message : 'Fehler'))
      .finally(() => setLoading(false))
  }, [id])

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setError('')
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

  return (
    <div className="editor-page">
      <div className="page-header">
        <div>
          <h1>{dialog.title}</h1>
          <p className="muted">
            {languageName(dialog.targetLanguage)} · {dialog.sections.length} Abschnitt
            {dialog.sections.length !== 1 ? 'e' : ''}
          </p>
        </div>
        <Link to={`/dialog/${dialog.id}/slideshow`} className="btn btn-primary">
          Diashow starten
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="panel toolbar-panel">
        <h2>KI-Werkzeuge</h2>
        <div className="toolbar-grid">
          <div className="toolbar-item">
            <label>Übersetzen in</label>
            <div className="inline-row">
              <select value={translateLang} onChange={(e) => setTranslateLang(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!!busy}
                onClick={() =>
                  runAction('translate', async () => {
                    const { dialog: d } = await api.ai.translate(dialog.id, translateLang)
                    setDialog(d)
                  })
                }
              >
                {busy === 'translate' ? '…' : 'Übersetzen'}
              </button>
            </div>
          </div>

          <div className="toolbar-item">
            <label>Birkenbihl (Muttersprache)</label>
            <div className="inline-row">
              <select value={birkenbihlLang} onChange={(e) => setBirkenbihlLang(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!!busy}
                onClick={() =>
                  runAction('birkenbihl', async () => {
                    const { dialog: d } = await api.ai.birkenbihl(dialog.id, birkenbihlLang)
                    setDialog(d)
                  })
                }
              >
                {busy === 'birkenbihl' ? '…' : 'Birkenbihl anwenden'}
              </button>
            </div>
          </div>

          <div className="toolbar-item">
            <label>Abschnitte</label>
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

          <div className="toolbar-item">
            <label>Bilder</label>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!!busy}
              onClick={() =>
                runAction('images', async () => {
                  const { dialog: d } = await api.ai.imageAll(dialog.id)
                  setDialog(d)
                })
              }
            >
              {busy === 'images' ? 'Generiere …' : 'Alle Bilder generieren'}
            </button>
          </div>
        </div>
      </section>

      {dialog.sections.map((section) => (
        <section key={section.id} className="panel section-panel">
          <div className="section-header">
            <h2>{section.title}</h2>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!!busy}
              onClick={() =>
                runAction(`img-${section.id}`, async () => {
                  const { dialog: d } = await api.ai.image(dialog.id, section.id)
                  setDialog(d)
                })
              }
            >
              {busy === `img-${section.id}` ? '…' : 'Bild generieren'}
            </button>
          </div>

          {section.imageUrl && (
            <img src={section.imageUrl} alt={section.title} className="section-image" />
          )}

          <div className="dialog-lines">
            {section.lines.map((line) => (
              <div key={line.id} className="dialog-line">
                <strong className="speaker">{line.speaker}</strong>
                <BirkenbihlLine line={line} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
