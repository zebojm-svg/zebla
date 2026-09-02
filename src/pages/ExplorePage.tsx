import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { LanguagePairFlags } from '../components/LanguagePairFlags'
import { LanguageFlag } from '../components/LanguageFlag'
import { useAuth } from '../context/AuthContext'
import { LANGUAGES, languageName } from '../types'
import type { PublicCatalogFolder, PublicCatalogItem } from '../../shared/public-catalog'

type LegacyItem = {
  id: string
  title: string
  sourceLanguage?: string
  targetLanguage?: string
  shareToken: string
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function ExplorePage() {
  const { user, loading: authLoading } = useAuth()
  const isMaster = user?.role === 'master'
  const [searchParams, setSearchParams] = useSearchParams()
  const folderId = searchParams.get('folder')

  const [folders, setFolders] = useState<PublicCatalogFolder[]>([])
  const [items, setItems] = useState<PublicCatalogItem[]>([])
  const [breadcrumbs, setBreadcrumbs] = useState<PublicCatalogFolder[]>([])
  const [legacy, setLegacy] = useState<LegacyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [importingId, setImportingId] = useState<string | null>(null)
  const [importMsg, setImportMsg] = useState('')

  const [adminOpen, setAdminOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderSource, setNewFolderSource] = useState('de')
  const [newFolderTarget, setNewFolderTarget] = useState('fa')
  const [newItemTitle, setNewItemTitle] = useState('')
  const [newItemShareToken, setNewItemShareToken] = useState('')
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null)
  const [adminBusy, setAdminBusy] = useState(false)

  const reload = useCallback(async () => {
    const res = await api.publicCatalog.list(folderId)
    setFolders(res.folders)
    setItems(res.items)
    setBreadcrumbs(res.breadcrumbs)
    return res
  }, [folderId])

  useEffect(() => {
    setLoading(true)
    setError('')
    void reload()
      .then(async (res) => {
        if (!folderId && res.folders.length === 0 && res.items.length === 0) {
          const legacyRes = await fetch('/api/public-shared')
          if (legacyRes.ok) {
            const data = (await legacyRes.json()) as { items: LegacyItem[] }
            setLegacy(data.items ?? [])
          }
        } else {
          setLegacy([])
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Fehler beim Laden'))
      .finally(() => setLoading(false))
  }, [reload, folderId])

  const currentFolder = breadcrumbs[breadcrumbs.length - 1]
  const isRoot = !folderId
  const showLanguagePairOnFolders = isRoot

  const importShareToken = async (shareToken: string) => {
    if (!user) return
    setImportingId(shareToken)
    setImportMsg('')
    try {
      const { dialog } = await api.dialogs.cloneFromShare(shareToken)
      setImportMsg(`„${dialog.title}" in deine Bibliothek kopiert.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kopieren fehlgeschlagen.')
    } finally {
      setImportingId(null)
    }
  }

  const openFolder = (id: string) => {
    setSearchParams({ folder: id })
  }

  const goUp = () => {
    const parent = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2].id : null
    if (parent) setSearchParams({ folder: parent })
    else setSearchParams({})
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    setAdminBusy(true)
    try {
      await api.publicCatalog.createFolder({
        name: newFolderName.trim(),
        parentId: folderId,
        sourceLanguage: !folderId ? newFolderSource : undefined,
        targetLanguage: !folderId ? newFolderTarget : undefined,
      })
      setNewFolderName('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ordner konnte nicht erstellt werden.')
    } finally {
      setAdminBusy(false)
    }
  }

  const handleCreateItem = async () => {
    if (!folderId || !newItemTitle.trim()) return
    setAdminBusy(true)
    try {
      await api.publicCatalog.createItem({
        folderId,
        title: newItemTitle.trim(),
        shareToken: newItemShareToken.trim() || undefined,
      })
      setNewItemTitle('')
      setNewItemShareToken('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eintrag konnte nicht erstellt werden.')
    } finally {
      setAdminBusy(false)
    }
  }

  const handleUpload = async (
    itemId: string,
    kind: 'thumbnail' | 'pdf' | 'video',
    file: File,
  ) => {
    setUploadingItemId(itemId)
    setError('')
    try {
      if (kind === 'video') {
        const { uploadUrl, path } = await api.publicCatalog.videoUploadUrl(
          itemId,
          file.type || 'video/mp4',
        )
        const put = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'video/mp4' },
          body: file,
        })
        if (!put.ok) throw new Error('Video-Upload fehlgeschlagen.')
        await api.publicCatalog.videoUploadComplete(itemId, path)
      } else {
        const dataBase64 = await readFileAsDataUrl(file)
        await api.publicCatalog.uploadSmall(itemId, kind, dataBase64)
      }
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen.')
    } finally {
      setUploadingItemId(null)
    }
  }

  const catalogEmpty = folders.length === 0 && items.length === 0

  const shellHeader = (
    <header className="zebo-shell-header">
      <div className="zebo-shell-header__left">
        <Link to="/explore" className="zebo-tool-pill">
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
  )

  return (
    <div className="layout">
      {shellHeader}
      <main className="main explore-page">
        <h1>Öffentliche Dialoge</h1>
        <p className="muted">
          Diashows und Videos nach Sprache und Thema — ansehen, optional Dialog als PDF, in die eigene
          Bibliothek kopieren.
        </p>

        {breadcrumbs.length > 0 && (
          <nav className="explore-breadcrumbs" aria-label="Ordner">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSearchParams({})}>
              Start
            </button>
            {breadcrumbs.map((f) => (
              <span key={f.id}>
                <span className="explore-breadcrumbs__sep">/</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => openFolder(f.id)}
                >
                  {f.name}
                </button>
              </span>
            ))}
          </nav>
        )}

        {isMaster && (
          <section className="explore-admin-panel">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setAdminOpen((v) => !v)}
            >
              {adminOpen ? 'Admin schliessen' : 'Admin: Ordner & Slideshows pflegen'}
            </button>
            {adminOpen && (
              <div className="explore-admin-form">
                <h3>Neuer Ordner{folderId ? '' : ' (Sprachpaar)'}</h3>
                <div className="explore-admin-row">
                  <input
                    className="input"
                    placeholder="Ordnername (z.B. Abendessen, Persisch lernen)"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                  />
                  {!folderId && (
                    <>
                      <select
                        className="input"
                        value={newFolderSource}
                        onChange={(e) => setNewFolderSource(e.target.value)}
                      >
                        {LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className="input"
                        value={newFolderTarget}
                        onChange={(e) => setNewFolderTarget(e.target.value)}
                      >
                        {LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={adminBusy}
                    onClick={() => void handleCreateFolder()}
                  >
                    Ordner anlegen
                  </button>
                </div>

                {folderId && (
                  <>
                    <h3>Neue Slideshow / Video</h3>
                    <div className="explore-admin-row">
                      <input
                        className="input"
                        placeholder="Titel"
                        value={newItemTitle}
                        onChange={(e) => setNewItemTitle(e.target.value)}
                      />
                      <input
                        className="input"
                        placeholder="Share-Token (optional, zum Kopieren)"
                        value={newItemShareToken}
                        onChange={(e) => setNewItemShareToken(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={adminBusy}
                        onClick={() => void handleCreateItem()}
                      >
                        Eintrag anlegen
                      </button>
                    </div>
                  </>
                )}

                {items.length > 0 && folderId && (
                  <div className="explore-admin-uploads">
                    <h3>Medien hochladen</h3>
                    {items.map((item) => (
                      <div key={item.id} className="explore-admin-item">
                        <strong>{item.title}</strong>
                        <label className="btn btn-secondary btn-sm">
                          Vorschaubild
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) void handleUpload(item.id, 'thumbnail', f)
                              e.target.value = ''
                            }}
                          />
                        </label>
                        <label className="btn btn-secondary btn-sm">
                          Video (MP4)
                          <input
                            type="file"
                            accept="video/mp4,video/*"
                            hidden
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) void handleUpload(item.id, 'video', f)
                              e.target.value = ''
                            }}
                          />
                        </label>
                        <label className="btn btn-secondary btn-sm">
                          PDF
                          <input
                            type="file"
                            accept="application/pdf"
                            hidden
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) void handleUpload(item.id, 'pdf', f)
                              e.target.value = ''
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            void api.publicCatalog.deleteItem(item.id).then(() => reload())
                          }
                        >
                          Löschen
                        </button>
                        {uploadingItemId === item.id ? (
                          <span className="muted">Upload …</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {error ? <p className="error-box">{error}</p> : null}
        {importMsg ? <p className="muted">{importMsg}</p> : null}

        {loading || authLoading ? (
          <p className="muted">Laden …</p>
        ) : (
          <>
            {folders.length > 0 && (
              <div className="explore-folder-grid">
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    className="explore-folder-card"
                    onClick={() => openFolder(folder.id)}
                  >
                    {showLanguagePairOnFolders &&
                    folder.sourceLanguage &&
                    folder.targetLanguage ? (
                      <LanguagePairFlags
                        source={folder.sourceLanguage}
                        target={folder.targetLanguage}
                        size="lg"
                      />
                    ) : (
                      <span className="explore-folder-card__icon">📁</span>
                    )}
                    <span className="explore-folder-card__name">{folder.name}</span>
                    {folder.sourceLanguage && folder.targetLanguage && !showLanguagePairOnFolders ? (
                      <span className="explore-folder-card__langs muted">
                        <LanguageFlag code={folder.sourceLanguage} size="sm" /> →{' '}
                        <LanguageFlag code={folder.targetLanguage} size="sm" />
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}

            {items.length > 0 && (
              <div className="explore-item-grid">
                {items.map((item) => (
                  <article key={item.id} className="explore-item-card">
                    <Link to={`/explore/watch/${item.id}`} className="explore-item-card__thumb-link">
                      {item.thumbnailUrl ? (
                        <img src={item.thumbnailUrl} alt="" className="explore-item-card__thumb" />
                      ) : (
                        <div className="explore-item-card__thumb explore-item-card__thumb--placeholder">
                          ▶
                        </div>
                      )}
                    </Link>
                    <div className="explore-item-card__body">
                      <h2 className="explore-item-card__title">{item.title}</h2>
                      {currentFolder?.sourceLanguage && currentFolder?.targetLanguage ? (
                        <p className="muted explore-item-card__langs">
                          <LanguageFlag code={currentFolder.sourceLanguage} size="sm" />{' '}
                          {languageName(currentFolder.sourceLanguage)} →{' '}
                          <LanguageFlag code={currentFolder.targetLanguage} size="sm" />{' '}
                          {languageName(currentFolder.targetLanguage)}
                        </p>
                      ) : null}
                      <div className="explore-item-card__actions">
                        <Link className="btn btn-primary btn-sm" to={`/explore/watch/${item.id}`}>
                          {item.videoUrl ? 'Video ansehen' : 'Öffnen'}
                        </Link>
                        {(item.pdfUrl || item.shareToken) && (
                          <a
                            className="btn btn-secondary btn-sm"
                            href={api.publicCatalog.pdfUrl(item.id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            PDF
                          </a>
                        )}
                        {item.shareToken && user ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={importingId === item.shareToken}
                            onClick={() => void importShareToken(item.shareToken!)}
                          >
                            {importingId === item.shareToken ? '…' : 'Kopieren'}
                          </button>
                        ) : item.shareToken ? (
                          <Link
                            className="btn btn-secondary btn-sm"
                            to={`/login?redirect=${encodeURIComponent(`/explore/watch/${item.id}`)}`}
                          >
                            Anmelden &amp; kopieren
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {catalogEmpty && legacy.length > 0 && (
              <>
                <p className="muted">
                  Noch keine kuratierten Ordner — hier die bisher freigegebenen Dialoge:
                </p>
                <ul className="dialog-list">
                  {legacy.map((item) => (
                    <li key={item.id} className="dialog-card dialog-card--public">
                      {item.targetLanguage ? (
                        <LanguageFlag code={item.targetLanguage} size="lg" />
                      ) : null}
                      <div>
                        <strong>{item.title}</strong>
                      </div>
                      <div className="library-card-actions">
                        <Link
                          className="btn btn-secondary btn-sm"
                          to={`/share/${encodeURIComponent(item.shareToken)}`}
                        >
                          Ansehen
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {catalogEmpty && legacy.length === 0 && (
              <p className="muted">
                Noch keine öffentlichen Inhalte.
                {isMaster
                  ? ' Oben «Admin» öffnen und Sprachpaar-Ordner anlegen.'
                  : ' Bald gibt es hier Videos und Ordner nach Sprache.'}
              </p>
            )}

            {folderId && folders.length === 0 && items.length === 0 && !catalogEmpty && (
              <p className="muted">
                Dieser Ordner ist leer.
                {isMaster ? ' Unter «Admin» Slideshow-Einträge anlegen.' : ''}
              </p>
            )}

            {folderId && (
              <button type="button" className="btn btn-ghost btn-sm explore-back" onClick={goUp}>
                ← Zurück
              </button>
            )}
          </>
        )}
      </main>
    </div>
  )
}
