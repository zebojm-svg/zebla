import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { LanguageFlag } from '../components/LanguageFlag'
import { languageName } from '../types'

type PublicItem = {
  id: string
  title: string
  sourceLanguage?: string
  targetLanguage?: string
  shareToken: string
  updatedAt?: string
}

export function PublicHomePage() {
  const { user, loading: authLoading } = useAuth()
  const [items, setItems] = useState<PublicItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/public-shared')
        if (!res.ok) throw new Error('Öffentliche Liste nicht ladbar.')
        const data = (await res.json()) as { items: PublicItem[] }
        if (!cancelled) setItems(data.items ?? [])
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Fehler beim Laden.')
          setItems([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const importItem = async (item: PublicItem) => {
    if (!user) return
    setImportingId(item.id)
    setImportMsg(null)
    setError(null)
    try {
      const { dialog } = await api.dialogs.cloneFromShare(item.shareToken)
      setImportMsg(`„${dialog.title}" in deine Bibliothek kopiert.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kopieren fehlgeschlagen.')
    } finally {
      setImportingId(null)
    }
  }

  return (
    <div className="layout">
      <header className="zebo-shell-header">
        <div className="zebo-shell-header__left">
          <Link to="/" className="zebo-tool-pill">
            <img src="/apple-touch-icon.png" alt="" className="zebo-tool-pill__icon" width={28} height={28} />
            <span className="zebo-tool-pill__name">Zebla</span>
          </Link>
        </div>
        <div className="zebo-shell-header__right">
          <a className="zebo-hub-link" href="https://zebotools.ch">
            ← ZeboTools
          </a>
          {user ? (
            <>
              <Link to="/story" className="btn btn-story-studio btn-sm">
                Story-Studio
              </Link>
              <Link to="/" className="btn btn-ghost btn-sm">
                Meine Bibliothek
              </Link>
            </>
          ) : (
            <>
              <Link to="/story" className="btn btn-story-studio btn-sm">
                Story-Studio
              </Link>
              <Link to="/login" className="btn btn-ghost btn-sm">
                Anmelden
              </Link>
            </>
          )}
        </div>
      </header>
      <main className="main">
        <h1>Öffentliche Dialoge</h1>
        <p className="muted">
          Freigegebene Dialoge (inkl. Diashow/Video) — ansehen und in die eigene Bibliothek
          kopieren. Zum Freigeben: in der Bibliothek «Teilen» bzw. Ordner «Öffentlich».
        </p>
        {error ? <p className="error-box">{error}</p> : null}
        {importMsg ? <p className="muted">{importMsg}</p> : null}
        {items === null || authLoading ? (
          <p className="muted">Laden …</p>
        ) : items.length === 0 ? (
          <p className="muted">Noch keine öffentlichen Dialoge.</p>
        ) : (
          <ul className="dialog-list">
            {items.map((item) => (
              <li key={item.id} className="dialog-card dialog-card--public">
                {item.targetLanguage ? (
                  <span
                    className="dialog-lang-flag"
                    title={languageName(item.targetLanguage)}
                    aria-label={languageName(item.targetLanguage)}
                  >
                    <LanguageFlag code={item.targetLanguage} size="lg" />
                  </span>
                ) : null}
                <div>
                  <strong>{item.title}</strong>
                  {item.sourceLanguage && item.targetLanguage ? (
                    <span className="muted">
                      {' '}
                      · <LanguageFlag code={item.sourceLanguage} size="sm" />{' '}
                      {languageName(item.sourceLanguage)}
                      → <LanguageFlag code={item.targetLanguage} size="sm" />{' '}
                      {languageName(item.targetLanguage)}
                    </span>
                  ) : null}
                </div>
                <div className="library-card-actions">
                  <Link
                    className="btn btn-secondary btn-sm"
                    to={`/share/${encodeURIComponent(item.shareToken)}`}
                  >
                    Ansehen
                  </Link>
                  {user ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={importingId === item.id}
                      onClick={() => void importItem(item)}
                    >
                      {importingId === item.id ? '…' : 'Kopieren'}
                    </button>
                  ) : (
                    <Link
                      className="btn btn-primary btn-sm"
                      to={`/login?redirect=${encodeURIComponent(`/share/${item.shareToken}`)}`}
                    >
                      Anmelden &amp; kopieren
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
