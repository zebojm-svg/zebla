import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { PublicCatalogItem } from '../../shared/public-catalog'

export function PublicWatchPage() {
  const { itemId } = useParams<{ itemId: string }>()
  const { user } = useAuth()
  const [item, setItem] = useState<PublicCatalogItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')

  useEffect(() => {
    if (!itemId) return
    api.publicCatalog
      .getItem(itemId)
      .then((res) => setItem(res.item))
      .catch((err) => setError(err instanceof Error ? err.message : 'Nicht gefunden'))
      .finally(() => setLoading(false))
  }, [itemId])

  const handleImport = async () => {
    if (!item?.shareToken || !user) return
    setImporting(true)
    try {
      const { dialog } = await api.dialogs.cloneFromShare(item.shareToken)
      setImportMsg(`„${dialog.title}" kopiert — in deiner Bibliothek.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kopieren fehlgeschlagen.')
    } finally {
      setImporting(false)
    }
  }

  if (loading) {
    return (
      <div className="page-center">
        <p className="muted">Laden …</p>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="page-center">
        <p className="error-box">{error || 'Eintrag nicht gefunden.'}</p>
        <Link to="/explore" className="btn btn-primary">
          Zurück
        </Link>
      </div>
    )
  }

  return (
    <div className="layout">
      <header className="zebo-shell-header">
        <div className="zebo-shell-header__left">
          <Link to="/explore" className="zebo-tool-pill">
            <img src="/apple-touch-icon.png" alt="" className="zebo-tool-pill__icon" width={28} height={28} />
            <span className="zebo-tool-pill__name">Zebla</span>
          </Link>
        </div>
        <div className="zebo-shell-header__right">
          <Link to="/explore" className="btn btn-ghost btn-sm">
            ← Alle Dialoge
          </Link>
        </div>
      </header>
      <main className="main explore-watch">
        <h1>{item.title}</h1>
        {item.description ? <p className="muted">{item.description}</p> : null}

        {item.videoUrl ? (
          <video
            className="explore-watch__video"
            src={item.videoUrl}
            controls
            playsInline
            poster={item.thumbnailUrl}
          />
        ) : item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" className="explore-watch__poster" />
        ) : (
          <p className="muted">Noch kein Video hochgeladen.</p>
        )}

        <div className="explore-watch__actions">
          {item.shareToken && (
            <Link className="btn btn-secondary" to={`/share/${encodeURIComponent(item.shareToken)}`}>
              Dialog-Text ansehen
            </Link>
          )}
          {(item.pdfUrl || item.shareToken) && (
            <a
              className="btn btn-secondary"
              href={api.publicCatalog.pdfUrl(item.id)}
              target="_blank"
              rel="noreferrer"
            >
              Dialog als PDF
            </a>
          )}
          {item.shareToken && user ? (
            <button type="button" className="btn btn-primary" disabled={importing} onClick={() => void handleImport()}>
              {importing ? '…' : 'In meine Bibliothek kopieren'}
            </button>
          ) : item.shareToken ? (
            <Link
              className="btn btn-primary"
              to={`/login?redirect=${encodeURIComponent(`/explore/watch/${item.id}`)}`}
            >
              Anmelden &amp; kopieren
            </Link>
          ) : null}
        </div>
        {importMsg ? <p className="muted">{importMsg}</p> : null}
        {error ? <p className="error-box">{error}</p> : null}
      </main>
    </div>
  )
}
