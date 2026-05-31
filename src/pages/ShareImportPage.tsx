import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { BirkenbihlLine } from '../components/BirkenbihlLine'
import { useAuth } from '../context/AuthContext'
import type { DialogSection } from '../types'
import { isRtlLanguage, languageName } from '../types'

interface SharedPreview {
  title: string
  sourceLanguage: string
  targetLanguage: string
  length: string
  sections: DialogSection[]
}

export function ShareImportPage() {
  const { token } = useParams<{ token: string }>()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const folderId = searchParams.get('folder')

  const [preview, setPreview] = useState<SharedPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    api.shared
      .get(token)
      .then((res) => setPreview(res.dialog))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Dialog nicht gefunden.'),
      )
      .finally(() => setLoading(false))
  }, [token])

  const handleImport = async () => {
    if (!token || !user) return
    setImporting(true)
    setError('')
    try {
      const { dialog } = await api.dialogs.cloneFromShare(token, folderId)
      navigate(`/dialog/${dialog.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import fehlgeschlagen.')
      setImporting(false)
    }
  }

  const loginUrl = `/login?redirect=${encodeURIComponent(`/share/${token ?? ''}`)}`

  if (loading || authLoading) {
    return (
      <div className="page-center">
        <p className="muted">Lade geteilten Dialog …</p>
      </div>
    )
  }

  if (!preview) {
    return (
      <div className="page-center">
        <div className="share-import-card">
          <h1>Link ungültig</h1>
          <p className="muted">{error || 'Dieser Freigabe-Link existiert nicht mehr.'}</p>
          <Link to="/" className="btn btn-primary">
            Zur Startseite
          </Link>
        </div>
      </div>
    )
  }

  const lineCount = preview.sections.reduce((n, s) => n + s.lines.length, 0)
  const targetRtl = isRtlLanguage(preview.targetLanguage)

  return (
    <div className="share-import-page">
      <div className="share-import-card">
        <p className="share-import-badge">Geteilter Dialog</p>
        <h1>{preview.title}</h1>
        <p className="muted">
          {languageName(preview.targetLanguage)}
          {targetRtl ? ' · Rechts-nach-links' : ''} · {preview.sections.length} Abschnitt
          {preview.sections.length !== 1 ? 'e' : ''} · {lineCount} Zeilen
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="share-preview">
          {preview.sections.slice(0, 1).map((section) => (
            <div key={section.id}>
              <h3>{section.title}</h3>
              {section.lines.slice(0, 3).map((line) => (
                <div key={line.id} className="dialog-line">
                  <div className="dialog-line-body">
                    <strong className="speaker">{line.speaker}</strong>
                    <BirkenbihlLine
                      line={line}
                      targetLanguage={preview.targetLanguage}
                      nativeLanguage={preview.sourceLanguage}
                    />
                  </div>
                </div>
              ))}
              {section.lines.length > 3 && (
                <p className="muted">… und {section.lines.length - 3} weitere Zeilen</p>
              )}
            </div>
          ))}
        </div>

        <div className="share-import-actions">
          {user ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={importing}
              onClick={handleImport}
            >
              {importing ? 'Kopiere …' : 'In meine Bibliothek kopieren'}
            </button>
          ) : (
            <Link to={loginUrl} className="btn btn-primary">
              Anmelden und kopieren
            </Link>
          )}
          <Link to="/" className="btn btn-secondary">
            Abbrechen
          </Link>
        </div>
      </div>
    </div>
  )
}
