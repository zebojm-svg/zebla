import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type { Dialog, DialogFolder } from '../types'
import { languageName } from '../types'

function folderPath(
  folderId: string | null,
  folders: DialogFolder[],
): DialogFolder[] {
  if (!folderId) return []
  const byId = new Map(folders.map((f) => [f.id, f]))
  const path: DialogFolder[] = []
  let cur: string | null = folderId
  while (cur) {
    const folder = byId.get(cur)
    if (!folder) break
    path.unshift(folder)
    cur = folder.parentId
  }
  return path
}

function isDescendantFolder(
  folderId: string,
  potentialAncestorId: string,
  folders: DialogFolder[],
): boolean {
  const byId = new Map(folders.map((f) => [f.id, f]))
  let cur: string | null = folderId
  while (cur) {
    if (cur === potentialAncestorId) return true
    cur = byId.get(cur)?.parentId ?? null
  }
  return false
}

type MoveTarget = { kind: 'folder'; id: string | null; label: string }

function folderLabel(folderId: string, folders: DialogFolder[]): string {
  return folderPath(folderId, folders)
    .map((f) => f.name)
    .join(' / ')
}

function moveTargets(
  folders: DialogFolder[],
  excludeFolderId?: string,
): MoveTarget[] {
  const targets: MoveTarget[] = [{ kind: 'folder', id: null, label: 'Hauptverzeichnis' }]
  for (const folder of folders) {
    if (excludeFolderId && folder.id === excludeFolderId) continue
    if (excludeFolderId && isDescendantFolder(folder.id, excludeFolderId, folders)) continue
    targets.push({ kind: 'folder', id: folder.id, label: folderLabel(folder.id, folders) })
  }
  return targets.sort((a, b) => a.label.localeCompare(b.label, 'de'))
}

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const currentFolderId = searchParams.get('folder')

  const [folders, setFolders] = useState<DialogFolder[]>([])
  const [dialogs, setDialogs] = useState<Dialog[]>([])
  const [loading, setLoading] = useState(true)
  const [aiReady, setAiReady] = useState(true)
  const [error, setError] = useState('')

  const [moveItem, setMoveItem] = useState<
    { type: 'folder' | 'dialog'; id: string; name: string } | null
  >(null)
  const [moveTargetId, setMoveTargetId] = useState<string>('')

  const loadLibrary = useCallback(async () => {
    const [libRes, statusRes] = await Promise.all([
      api.library.list(),
      api.ai.status(),
    ])
    setFolders(libRes.folders)
    setDialogs(libRes.dialogs)
    setAiReady(statusRes.configured)
  }, [])

  useEffect(() => {
    loadLibrary()
      .catch((err) => setError(err instanceof Error ? err.message : 'Fehler beim Laden'))
      .finally(() => setLoading(false))
  }, [loadLibrary])

  const breadcrumbs = useMemo(
    () => folderPath(currentFolderId, folders),
    [currentFolderId, folders],
  )

  const childFolders = useMemo(
    () =>
      folders
        .filter((f) => (f.parentId ?? null) === (currentFolderId ?? null))
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [folders, currentFolderId],
  )

  const childDialogs = useMemo(
    () =>
      dialogs
        .filter((d) => (d.folderId ?? null) === (currentFolderId ?? null))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [dialogs, currentFolderId],
  )

  const openFolder = (folderId: string) => {
    setSearchParams({ folder: folderId })
  }

  const goToRoot = () => setSearchParams({})

  const createFolder = async () => {
    const name = window.prompt('Name des neuen Ordners:')
    if (!name?.trim()) return
    setError('')
    try {
      const { folder } = await api.folders.create(name.trim(), currentFolderId)
      setFolders((prev) => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name, 'de')))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ordner konnte nicht erstellt werden.')
    }
  }

  const renameFolder = async (folder: DialogFolder) => {
    const name = window.prompt('Neuer Ordnername:', folder.name)
    if (!name?.trim() || name.trim() === folder.name) return
    setError('')
    try {
      const { folder: updated } = await api.folders.update(folder.id, { name: name.trim() })
      setFolders((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Umbenennen fehlgeschlagen.')
    }
  }

  const renameDialog = async (dialog: Dialog) => {
    const title = window.prompt('Neuer Dialogtitel:', dialog.title)
    if (!title?.trim() || title.trim() === dialog.title) return
    setError('')
    try {
      const { dialog: updated } = await api.dialogs.update(dialog.id, { title: title.trim() })
      setDialogs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Umbenennen fehlgeschlagen.')
    }
  }

  const deleteFolder = async (folder: DialogFolder) => {
    if (
      !confirm(
        `Ordner „${folder.name}" löschen? Unterordner und Dialoge werden eine Ebene nach oben verschoben.`,
      )
    ) {
      return
    }
    setError('')
    try {
      await api.folders.delete(folder.id)
      await loadLibrary()
      if (currentFolderId === folder.id) {
        if (folder.parentId) setSearchParams({ folder: folder.parentId })
        else goToRoot()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.')
    }
  }

  const deleteDialog = async (id: string) => {
    if (!confirm('Dialog wirklich löschen?')) return
    setError('')
    try {
      await api.dialogs.delete(id)
      setDialogs((d) => d.filter((x) => x.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.')
    }
  }

  const openMove = (type: 'folder' | 'dialog', id: string, name: string) => {
    setMoveItem({ type, id, name })
    setMoveTargetId('')
  }

  const confirmMove = async () => {
    if (!moveItem) return
    const targetId = moveTargetId === '' ? null : moveTargetId
    setError('')
    try {
      if (moveItem.type === 'folder') {
        const { folder } = await api.folders.update(moveItem.id, { parentId: targetId })
        setFolders((prev) => prev.map((f) => (f.id === folder.id ? folder : f)))
      } else {
        const { dialog } = await api.dialogs.update(moveItem.id, { folderId: targetId })
        setDialogs((prev) => prev.map((d) => (d.id === dialog.id ? dialog : d)))
      }
      setMoveItem(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verschieben fehlgeschlagen.')
    }
  }

  const createLink = currentFolderId ? `/create?folder=${currentFolderId}` : '/create'
  const isEmpty = childFolders.length === 0 && childDialogs.length === 0

  if (loading) {
    return (
      <div className="page-center">
        <p className="muted">Lade Bibliothek …</p>
      </div>
    )
  }

  const moveOptions = moveItem
    ? moveTargets(
        folders,
        moveItem.type === 'folder' ? moveItem.id : undefined,
      )
    : []

  return (
    <div className="dashboard">
      <div className="page-header">
        <div>
          <h1>Meine Dialoge</h1>
          <p className="muted">Ordne Dialoge in Ordnern – erstellen, verschieben, umbenennen.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-secondary" onClick={createFolder}>
            + Ordner
          </button>
          <Link to={createLink} className="btn btn-primary">
            + Neuer Dialog
          </Link>
        </div>
      </div>

      <nav className="breadcrumb" aria-label="Ordnerpfad">
        <button type="button" className="breadcrumb-link" onClick={goToRoot}>
          Hauptverzeichnis
        </button>
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

      {!aiReady && (
        <div className="alert alert-warn">
          GEMINI_API_KEY ist nicht gesetzt – KI-Funktionen sind deaktiviert.
        </div>
      )}

      {isEmpty ? (
        <div className="empty-state">
          <h2>{currentFolderId ? 'Ordner ist leer' : 'Noch keine Dialoge'}</h2>
          <p>
            {currentFolderId
              ? 'Lege hier Ordner an oder erstelle einen Dialog in diesem Ordner.'
              : 'Starte mit deinem ersten Dialog – per KI-Gespräch, Thema oder Diktat.'}
          </p>
          <div className="empty-state-actions">
            <button type="button" className="btn btn-secondary" onClick={createFolder}>
              Ordner anlegen
            </button>
            <Link to={createLink} className="btn btn-primary">
              Dialog erstellen
            </Link>
          </div>
        </div>
      ) : (
        <div className="library-grid">
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
              <div className="library-card-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => renameFolder(folder)}
                >
                  Umbenennen
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => openMove('folder', folder.id, folder.name)}
                >
                  Verschieben
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-danger"
                  onClick={() => deleteFolder(folder)}
                >
                  Löschen
                </button>
              </div>
            </article>
          ))}

          {childDialogs.map((d) => (
            <article key={d.id} className="library-card dialog-card">
              <h3>{d.title}</h3>
              <p className="dialog-meta">
                {languageName(d.targetLanguage)} · {d.sections.length} Abschnitt
                {d.sections.length !== 1 ? 'e' : ''}
              </p>
              <div className="library-card-actions">
                <Link to={`/dialog/${d.id}`} className="btn btn-secondary btn-sm">
                  Bearbeiten
                </Link>
                <Link to={`/dialog/${d.id}/slideshow`} className="btn btn-secondary btn-sm">
                  Diashow
                </Link>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => renameDialog(d)}
                >
                  Umbenennen
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => openMove('dialog', d.id, d.title)}
                >
                  Verschieben
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-danger"
                  onClick={() => deleteDialog(d.id)}
                >
                  Löschen
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {moveItem && (
        <div className="modal-backdrop" onClick={() => setMoveItem(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Verschieben</h2>
            <p className="muted">
              „{moveItem.name}" nach:
            </p>
            <select
              className="input"
              value={moveTargetId}
              onChange={(e) => setMoveTargetId(e.target.value)}
            >
              {moveOptions.map((opt) => (
                <option key={opt.id ?? 'root'} value={opt.id ?? ''}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setMoveItem(null)}>
                Abbrechen
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmMove}>
                Verschieben
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
