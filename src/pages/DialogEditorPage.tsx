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
  const [status, setStatus] = useState('')
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
    setStatus('')
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setBusy(null)
      setStatus('')
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
      {status && <div className="alert alert-warn">{status}</div>}

      <section className="panel toolbar-panel">
        <h2>KI-Werkzeuge</h2>
        <div className="toolbar-grid">
          <div className="tool-group">
            <span className="tool-label">Übersetzen in</span>
            <div className="tool-controls">
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

          <div className="tool-group">
            <span className="tool-label">Birkenbihl (Muttersprache)</span>
            <div className="tool-controls">
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
                {busy === 'birkenbihl' ? '…' : 'Anwenden'}
              </button>
            </div>
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
            <div className="tool-controls tool-controls--single">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!!busy}
                onClick={() =>
                  runAction('images', async () => {
                    let current = dialog
                    for (let i = 0; i < current.sections.length; i++) {
                      const section = current.sections[i]
                      setStatus(
                        `Generiere Bild ${i + 1} von ${current.sections.length} (ca. 15–30 s) …`,
                      )
                      const { dialog: d } = await api.ai.image(current.id, section.id)
                      current = d
                      setDialog(d)
                      if (i < current.sections.length - 1) {
                        await new Promise((resolve) => setTimeout(resolve, 3000))
                      }
                    }
                  })
                }
              >
                {busy === 'images' ? 'Generiere …' : 'Alle Bilder generieren'}
              </button>
            </div>
          </div>
        </div>
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
                onClick={() =>
                  runAction(`img-${section.id}`, async () => {
                    setStatus('Bild wird generiert (ca. 15–30 Sekunden) …')
                    const { dialog: d } = await api.ai.image(dialog.id, section.id)
                    setDialog(d)
                  })
                }
              >
                {busy === `img-${section.id}` ? '…' : 'Titelbild'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!!busy}
                onClick={() =>
                  runAction(`scenes-${section.id}`, async () => {
                    let beatIndex = 0
                    let replan = true
                    let current = dialog
                    let done = false
                    while (!done) {
                      setStatus(
                        replan
                          ? 'KI plant Szenen …'
                          : `Generiere Szene ${beatIndex + 1} … (ca. 15–30 s)`,
                      )
                      const res = await api.ai.imageLines(
                        current.id,
                        section.id,
                        beatIndex,
                        replan,
                      )
                      current = res.dialog
                      setDialog(res.dialog)
                      done = res.done
                      beatIndex++
                      replan = false
                      if (!done) {
                        await new Promise((r) => setTimeout(r, 2500))
                      }
                    }
                    setStatus(`Fertig – ${beatIndex} Szenen-Bilder.`)
                  })
                }
              >
                {busy === `scenes-${section.id}` ? '…' : 'Szenen-Bilder (KI)'}
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
                  <BirkenbihlLine line={line} />
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
    </div>
  )
}
