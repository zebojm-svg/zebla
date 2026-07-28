import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { LanguagePairFlags } from '../components/LanguagePairFlags'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { languagePairKey, languagePairLabel } from '../../shared/language-flags'
import type { DialogLength } from '../types'

type PublicFolder = {
  id: string
  name: string
  parentId: string | null
  visibility: 'public'
  createdAt: string
  updatedAt: string
}

type PublicDialog = {
  id: string
  title: string
  sourceLanguage: string
  targetLanguage: string
  length: DialogLength
  folderId: string | null
  visibility: 'public'
  sectionsCount: number
  updatedAt: string
  createdAt: string
}

function folderPath(folderId: string | null, folders: PublicFolder[]): PublicFolder[] {
  if (!folderId) return []
  const byId = new Map(folders.map((f) => [f.id, f]))
  const path: PublicFolder[] = []
  let cur: string | null = folderId
  while (cur) {
    const folder = byId.get(cur)
    if (!folder) break
    path.unshift(folder)
    cur = folder.parentId
  }
  return path
}

export function ExplorePage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const currentFolderId = searchParams.get('folder')
  const pairFilter = searchParams.get('pair')

  const [folders, setFolders] = useState<PublicFolder[]>([])
  const [dialogs, setDialogs] = useState<PublicDialog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [importingId, setImportingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await api.publicLibrary.list()
    setFolders(res.folders)
    setDialogs(res.dialogs)
  }, [])

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : 'Fehler beim Laden'))
      .finally(() => setLoading(false))
  }, [load])

  const languagePairs = useMemo(() => {
    const map = new Map<string, { source: string; target: string; count: number }>()
    for (const d of dialogs) {
      const key = languagePairKey(d.sourceLanguage, d.targetLanguage)
      const prev = map.get(key)
      if (prev) prev.count += 1
      else map.set(key, { source: d.sourceLanguage, target: d.targetLanguage, count: 1 })
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => a.key.localeCompare(b.key))
  }, [dialogs])

  const filteredDialogs = useMemo(() => {
    let list = dialogs
    if (pairFilter) {
      list = list.filter(
        (d) => languagePairKey(d.sourceLanguage, d.targetLanguage) === pairFilter,
      )
    }
    return list
  }, [dialogs, pairFilter])

  const breadcrumbs = useMemo(
    () => folderPath(currentFolderId, folders),
    [currentFolderId, folders],
  )

  const childFolders = useMemo(() => {
    const parent = currentFolderId ?? null
    // Nur Ordner zeigen, die im gefilterten Dialog-Set vorkommen (oder Unterordner davon)
    const relevantFolderIds = new Set<string>()
    for (const d of filteredDialogs) {
      for (const f of folderPath(d.folderId, folders)) {
        relevantFolderIds.add(f.id)
      }
    }
    return folders
      .filter((f) => (f.parentId ?? null) === parent && relevantFolderIds.has(f.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
  }, [folders, currentFolderId, filteredDialogs])

  const childDialogs = useMemo(
    () =>
      filteredDialogs
        .filter((d) => (d.folderId ?? null) === (currentFolderId ?? null))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [filteredDialogs, currentFolderId],
  )

  const showPairCards = !currentFolderId && !pairFilter && languagePairs.length > 0

  const openFolder = (folderId: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('folder', folderId)
    setSearchParams(next)
  }

  const openPair = (key: string) => {
    const next = new URLSearchParams()
    next.set('pair', key)
    setSearchParams(next)
  }

  const goToRoot = () => setSearchParams({})

  const goToPairRoot = () => {
    if (!pairFilter) {
      setSearchParams({})
      return
    }
    const next = new URLSearchParams()
    next.set('pair', pairFilter)
    setSearchParams(next)
  }

  const importDialog = async (dialogId: string) => {
    if (!user) return
    setImportingId(dialogId)
    setError('')
    try {
      const { dialog } = await api.dialogs.clonePublic(dialogId)
      window.location.href = `/dialog/${dialog.id}`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Übernehmen fehlgeschlagen.')
      setImportingId(null)
    }
  }

  const activePair = languagePairs.find((p) => p.key === pairFilter)
  const isEmpty = showPairCards
    ? languagePairs.length === 0
    : childFolders.length === 0 && childDialogs.length === 0

  if (loading) {
    return (
      <div className="page-center">
        <p className="muted">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="dashboard explore-page">
      <div className="page-header">
        <div>
          <h1>{t('explore.title')}</h1>
          <p className="muted">{t('explore.subtitle')}</p>
        </div>
        <div className="header-actions">
          <Link to="/" className="btn btn-secondary">
            {t('explore.myLibrary')}
          </Link>
        </div>
      </div>

      <nav className="breadcrumb" aria-label="Ordnerpfad">
        <button type="button" className="breadcrumb-link" onClick={goToRoot}>
          {t('explore.root')}
        </button>
        {activePair && (
          <span className="breadcrumb-segment">
            <span className="breadcrumb-sep">/</span>
            <button type="button" className="breadcrumb-link" onClick={goToPairRoot}>
              <LanguagePairFlags
                sourceLanguage={activePair.source}
                targetLanguage={activePair.target}
                size="sm"
              />
            </button>
          </span>
        )}
        {breadcrumbs.map((folder) => (
          <span key={folder.id} className="breadcrumb-segment">
            <span className="breadcrumb-sep">/</span>
            <button
              type="button"
              className="breadcrumb-link"
              onClick={() => openFolder(folder.id)}
            >
              {folder.name}
            </button>
          </span>
        ))}
      </nav>

      {error && <div className="alert alert-warn">{error}</div>}

      {isEmpty ? (
        <div className="empty-state">
          <h2>{t('explore.empty')}</h2>
          <p>{t('explore.emptyHint')}</p>
        </div>
      ) : (
        <div className="library-grid">
          {showPairCards
            ? languagePairs.map((pair) => (
                <article key={pair.key} className="library-card folder-card lang-pair-card">
                  <button type="button" className="folder-open" onClick={() => openPair(pair.key)}>
                    <LanguagePairFlags
                      sourceLanguage={pair.source}
                      targetLanguage={pair.target}
                      size="lg"
                    />
                    <div>
                      <h3>{languagePairLabel(pair.source, pair.target)}</h3>
                      <p className="dialog-meta">
                        {pair.count}{' '}
                        {pair.count === 1 ? t('explore.dialogOne') : t('explore.dialogMany')}
                      </p>
                    </div>
                  </button>
                </article>
              ))
            : (
              <>
                {childFolders.map((folder) => (
                  <article key={folder.id} className="library-card folder-card">
                    <button
                      type="button"
                      className="folder-open"
                      onClick={() => openFolder(folder.id)}
                    >
                      <span className="folder-icon" aria-hidden>
                        📁
                      </span>
                      <h3>{folder.name}</h3>
                    </button>
                  </article>
                ))}

                {childDialogs.map((d) => (
                  <article key={d.id} className="library-card dialog-card">
                    <div className="dialog-card-flags">
                      <LanguagePairFlags
                        sourceLanguage={d.sourceLanguage}
                        targetLanguage={d.targetLanguage}
                        size="lg"
                      />
                    </div>
                    <h3>{d.title}</h3>
                    <p className="dialog-meta">
                      {languagePairLabel(d.sourceLanguage, d.targetLanguage)} · {d.sectionsCount}{' '}
                      {d.sectionsCount === 1 ? t('explore.sectionOne') : t('explore.sectionMany')}
                    </p>
                    <div className="library-card-actions">
                      {user ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={importingId === d.id}
                          onClick={() => importDialog(d.id)}
                        >
                          {importingId === d.id ? '…' : t('explore.import')}
                        </button>
                      ) : (
                        <Link
                          to={`/login?redirect=${encodeURIComponent('/explore')}`}
                          className="btn btn-primary btn-sm"
                        >
                          {t('explore.loginToImport')}
                        </Link>
                      )}
                    </div>
                  </article>
                ))}
              </>
            )}
        </div>
      )}
    </div>
  )
}
