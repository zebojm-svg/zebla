import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Dialog } from '../types'
import { languageName } from '../types'

export function DashboardPage() {
  const [dialogs, setDialogs] = useState<Dialog[]>([])
  const [loading, setLoading] = useState(true)
  const [aiReady, setAiReady] = useState(true)

  useEffect(() => {
    Promise.all([api.dialogs.list(), api.ai.status()])
      .then(([listRes, statusRes]) => {
        setDialogs(listRes.dialogs)
        setAiReady(statusRes.configured)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Dialog wirklich löschen?')) return
    await api.dialogs.delete(id)
    setDialogs((d) => d.filter((x) => x.id !== id))
  }

  if (loading) {
    return (
      <div className="page-center">
        <p className="muted">Lade Dialoge …</p>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <div className="page-header">
        <div>
          <h1>Meine Dialoge</h1>
          <p className="muted">Erstelle, bearbeite und übe Sprachdialoge.</p>
        </div>
        <Link to="/create" className="btn btn-primary">
          + Neuer Dialog
        </Link>
      </div>

      {!aiReady && (
        <div className="alert alert-warn">
          OPENAI_API_KEY ist nicht gesetzt – KI-Funktionen sind deaktiviert.
        </div>
      )}

      {dialogs.length === 0 ? (
        <div className="empty-state">
          <h2>Noch keine Dialoge</h2>
          <p>Starte mit deinem ersten Dialog – per KI-Gespräch, Thema oder Diktat.</p>
          <Link to="/create" className="btn btn-primary">
            Dialog erstellen
          </Link>
        </div>
      ) : (
        <div className="dialog-grid">
          {dialogs.map((d) => (
            <article key={d.id} className="dialog-card">
              <h3>{d.title}</h3>
              <p className="dialog-meta">
                {languageName(d.targetLanguage)} · {d.sections.length} Abschnitt
                {d.sections.length !== 1 ? 'e' : ''}
              </p>
              <div className="dialog-card-actions">
                <Link to={`/dialog/${d.id}`} className="btn btn-secondary">
                  Bearbeiten
                </Link>
                <Link to={`/dialog/${d.id}/slideshow`} className="btn btn-secondary">
                  Diashow
                </Link>
                <button
                  type="button"
                  className="btn btn-ghost btn-danger"
                  onClick={() => handleDelete(d.id)}
                >
                  Löschen
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
