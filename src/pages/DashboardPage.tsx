import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { copyTextToClipboard } from '../utils/clipboard'
import { LanguageFlag } from '../components/LanguageFlag'
import type { ClassRoom, Dialog, DialogFolder } from '../types'
import { languageName } from '../types'
import { useI18n } from '../i18n/I18nContext'

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
  opts: {
    excludeFolderId?: string
    scope: 'personal' | 'class'
    classId?: string | null
    rootLabel?: string
  },
): MoveTarget[] {
  const targets: MoveTarget[] = []
  if (opts.scope === 'personal') {
    targets.push({ kind: 'folder', id: null, label: opts.rootLabel ?? 'Hauptverzeichnis' })
  }

  for (const folder of folders) {
    if (opts.excludeFolderId && folder.id === opts.excludeFolderId) continue
    if (
      opts.excludeFolderId &&
      isDescendantFolder(folder.id, opts.excludeFolderId, folders)
    ) {
      continue
    }
    if (opts.scope === 'personal') {
      if (folder.scope === 'class') continue
    } else {
      if (folder.scope !== 'class' || folder.classId !== opts.classId) continue
    }
    targets.push({
      kind: 'folder',
      id: folder.id,
      label: folderLabel(folder.id, folders),
    })
  }
  return targets.sort((a, b) => a.label.localeCompare(b.label, 'de'))
}

export function DashboardPage() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const currentFolderId = searchParams.get('folder')

  const [folders, setFolders] = useState<DialogFolder[]>([])
  const [dialogs, setDialogs] = useState<Dialog[]>([])
  const [classes, setClasses] = useState<ClassRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [aiReady, setAiReady] = useState(true)
  const [error, setError] = useState('')

  const [moveItem, setMoveItem] = useState<
    { type: 'folder' | 'dialog'; id: string; name: string; scope: 'personal' | 'class'; classId?: string | null } | null
  >(null)
  const [moveTargetId, setMoveTargetId] = useState<string>('')

  const [copyDialog, setCopyDialog] = useState<Dialog | null>(null)
  const [copyTargetFolderId, setCopyTargetFolderId] = useState('')
  const [copyBusy, setCopyBusy] = useState(false)
  const [shareBusyId, setShareBusyId] = useState<string | null>(null)
  const [shareCopiedId, setShareCopiedId] = useState<string | null>(null)

  const loadLibrary = useCallback(async () => {
    const [libRes, statusRes] = await Promise.all([
      api.library.list(),
      api.ai.status(),
    ])
    setFolders(libRes.folders)
    setDialogs(libRes.dialogs)
    setClasses(libRes.classes)
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

  const currentFolder = useMemo(
    () => (currentFolderId ? folders.find((f) => f.id === currentFolderId) ?? null : null),
    [currentFolderId, folders],
  )

  const inClassFolder = currentFolder?.scope === 'class'

  const isTeacherOrMaster = user?.role === 'teacher' || user?.role === 'master'
  const canManageClassFolders = isTeacherOrMaster && inClassFolder
  const canCreateFolder = !inClassFolder || canManageClassFolders

  const classRootFolderIds = useMemo(
    () => new Set(classes.map((c) => c.rootFolderId)),
    [classes],
  )

  const classFoldersForCopy = useMemo(
    () =>
      folders
        .filter((f) => f.scope === 'class')
        .sort((a, b) => folderLabel(a.id, folders).localeCompare(folderLabel(b.id, folders), 'de')),
    [folders],
  )

  const hasClassFolders = classFoldersForCopy.length > 0

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

  const isClassTeacher = (classId: string | null | undefined) => {
    if (!user || !classId) return false
    if (user.role === 'master') return true
    const classroom = classes.find((c) => c.id === classId)
    return !!classroom && classroom.teacherId === user.id
  }

  const canEditDialog = (dialog: Dialog) => {
    if (!user) return false
    if (dialog.userId === user.id) return true
    if (user.role === 'master') return true
    return isClassTeacher(dialog.classId)
  }

  const canManageFolder = (folder: DialogFolder) => {
    if (folder.scope === 'class') {
      if (classRootFolderIds.has(folder.id) || folder.parentId === null) return false
      return isTeacherOrMaster
    }
    return true
  }

  const createFolder = async () => {
    if (!canCreateFolder) return
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
    if (!canManageFolder(folder)) return
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
    if (!canEditDialog(dialog)) return
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

  /** Teilen: Link erzeugen, öffentlich listen, Zwischenablage (mit Fallback). */
  const shareDialog = async (dialog: Dialog) => {
    if (!canEditDialog(dialog) || dialog.classId) return
    setError('')
    setShareBusyId(dialog.id)
    try {
      let token = dialog.shareToken ?? null
      if (!token) {
        const { dialog: updated } = await api.dialogs.setSharing(dialog.id, true)
        setDialogs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
        token = updated.shareToken ?? null
      }
      if (!token) throw new Error('Freigabe fehlgeschlagen.')
      const url = `${window.location.origin}/share/${token}`
      await copyTextToClipboard(url)
      setShareCopiedId(dialog.id)
      setTimeout(() => setShareCopiedId(null), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Teilen fehlgeschlagen.')
    } finally {
      setShareBusyId(null)
    }
  }

  const stopSharing = async (dialog: Dialog) => {
    if (!canEditDialog(dialog)) return
    setError('')
    setShareBusyId(dialog.id)
    try {
      const { dialog: updated } = await api.dialogs.setSharing(dialog.id, false)
      setDialogs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Freigabe beenden fehlgeschlagen.')
    } finally {
      setShareBusyId(null)
    }
  }

  const shareFolder = async (folder: DialogFolder) => {
    if (folder.scope === 'class' || !isTeacherOrMaster) return
    setError('')
    setShareBusyId(folder.id)
    try {
      const { updated, dialogs: touched } = await api.folders.setSharing(folder.id, true)
      if (updated === 0) {
        setError('Ordner enthält keine persönlichen Dialoge zum Freigeben.')
        return
      }
      setDialogs((prev) => {
        const byId = new Map(touched.map((d) => [d.id, d]))
        return prev.map((d) => byId.get(d.id) ?? d)
      })
      const url = `${window.location.origin}/explore`
      await copyTextToClipboard(url)
      setShareCopiedId(folder.id)
      setTimeout(() => setShareCopiedId(null), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ordner-Freigabe fehlgeschlagen.')
    } finally {
      setShareBusyId(null)
    }
  }

  const stopShareFolder = async (folder: DialogFolder) => {
    if (folder.scope === 'class' || !isTeacherOrMaster) return
    setError('')
    setShareBusyId(folder.id)
    try {
      const { dialogs: touched } = await api.folders.setSharing(folder.id, false)
      setDialogs((prev) => {
        const byId = new Map(touched.map((d) => [d.id, d]))
        return prev.map((d) => byId.get(d.id) ?? d)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Freigabe beenden fehlgeschlagen.')
    } finally {
      setShareBusyId(null)
    }
  }

  const deleteFolder = async (folder: DialogFolder) => {
    if (!canManageFolder(folder)) return
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

  const deleteDialog = async (dialog: Dialog) => {
    if (!canEditDialog(dialog)) return
    if (!confirm('Dialog wirklich löschen?')) return
    setError('')
    try {
      await api.dialogs.delete(dialog.id)
      setDialogs((d) => d.filter((x) => x.id !== dialog.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.')
    }
  }

  const openMoveFolder = (folder: DialogFolder) => {
    if (!canManageFolder(folder)) return
    setMoveItem({
      type: 'folder',
      id: folder.id,
      name: folder.name,
      scope: folder.scope,
      classId: folder.classId,
    })
    setMoveTargetId(folder.parentId ?? '')
  }

  const openMoveDialog = (dialog: Dialog) => {
    if (!canEditDialog(dialog)) return
    const folder = dialog.folderId
      ? folders.find((f) => f.id === dialog.folderId)
      : null
    const scope = folder?.scope === 'class' || dialog.classId ? 'class' : 'personal'
    setMoveItem({
      type: 'dialog',
      id: dialog.id,
      name: dialog.title,
      scope,
      classId: dialog.classId ?? folder?.classId ?? null,
    })
    setMoveTargetId(dialog.folderId ?? '')
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

  const openCopyToClass = (dialog: Dialog) => {
    const first = classFoldersForCopy[0]
    setCopyDialog(dialog)
    setCopyTargetFolderId(first?.id ?? '')
  }

  const confirmCopyToClass = async () => {
    if (!copyDialog || !copyTargetFolderId) return
    const targetFolder = folders.find((f) => f.id === copyTargetFolderId)
    if (!targetFolder?.classId) {
      setError('Zielordner ist kein Klassenordner.')
      return
    }
    setCopyBusy(true)
    setError('')
    try {
      const { dialog } = await api.dialogs.copyToClass(
        copyDialog.id,
        targetFolder.classId,
        targetFolder.id,
      )
      setDialogs((prev) => [...prev, dialog])
      setCopyDialog(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kopieren fehlgeschlagen.')
    } finally {
      setCopyBusy(false)
    }
  }

  const createLink = currentFolderId ? `/create?folder=${currentFolderId}` : '/create'
  const isEmpty = childFolders.length === 0 && childDialogs.length === 0
  const showProBanner = user?.role === 'teacher' && !user.proActive

  if (loading) {
    return (
      <div className="page-center">
        <p className="muted">Lade Bibliothek …</p>
      </div>
    )
  }

  const moveOptions = moveItem
    ? moveTargets(folders, {
        excludeFolderId: moveItem.type === 'folder' ? moveItem.id : undefined,
        scope: moveItem.scope,
        classId: moveItem.classId,
        rootLabel: t('dashboard.root'),
      })
    : []

  return (
    <div className="dashboard">
      <div className="page-header">
        <div>
          <h1>{t('dashboard.title')}</h1>
          <p className="muted">
            Ordne Dialoge in Ordnern. «Teilen» / Ordner «Öffentlich» stellt sie unter{' '}
            <Link to="/explore">Öffentliche Dialoge</Link> bereit.
          </p>
        </div>
        <div className="header-actions">
          <Link to="/story" className="btn btn-story-studio">
            Story-Studio
          </Link>
          {canCreateFolder && (
            <button type="button" className="btn btn-secondary" onClick={createFolder}>
              + {t('dashboard.newFolder')}
            </button>
          )}
          <Link to={createLink} className="btn btn-primary">
            + {t('dashboard.newDialog')}
          </Link>
        </div>
      </div>

      <div className="dashboard-story-cta">
        <p>
          <strong>Story-Studio</strong>
          Figuren, Hintergründe und Szenen für Bildgeschichten — wie Bookbox, Schritt für Schritt.
        </p>
        <Link to="/story" className="btn btn-story-studio">
          Zum Story-Studio
        </Link>
      </div>

      <nav className="breadcrumb" aria-label="Ordnerpfad">
        <button type="button" className="breadcrumb-link" onClick={goToRoot}>
          {t('dashboard.root')}
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

      {showProBanner && (
        <div className="alert alert-warn">
          Ohne Pro ist KI für dich deaktiviert.{' '}
          <Link to="/pro">Pro freischalten</Link>
        </div>
      )}

      {inClassFolder && (
        <div className="alert alert-info">
          Klassenordner: Alle Klassenmitglieder sehen die Dialoge hier. Unterordner anlegen,
          umbenennen, verschieben und löschen können nur Lehrkräfte. Dialoge können von der
          Eigentümerin/dem Eigentümer sowie von der Lehrkraft bearbeitet werden.
        </div>
      )}

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
              ? inClassFolder
                ? canManageClassFolders
                  ? 'Lege hier Ordner an oder erstelle einen Dialog in diesem Klassenordner.'
                  : 'Erstelle hier einen Dialog – Unterordner legt die Lehrkraft an.'
                : 'Lege hier Ordner an oder erstelle einen Dialog in diesem Ordner.'
              : 'Starte mit deinem ersten Dialog – per KI-Gespräch, Thema oder Diktat.'}
          </p>
          <div className="empty-state-actions">
            <Link to="/story" className="btn btn-story-studio">
              Story-Studio
            </Link>
            {canCreateFolder && (
              <button type="button" className="btn btn-secondary" onClick={createFolder}>
                Ordner anlegen
              </button>
            )}
            <Link to={createLink} className="btn btn-primary">
              Dialog erstellen
            </Link>
          </div>
        </div>
      ) : (
        <div className="library-grid">
          {childFolders.map((folder) => {
            const isClassRoot =
              folder.scope === 'class' &&
              (folder.parentId === null || classRootFolderIds.has(folder.id))
            const showFolderActions = canManageFolder(folder)
            return (
              <article
                key={folder.id}
                className={`library-card folder-card${isClassRoot ? ' class-folder-card' : ''}`}
              >
                <button
                  type="button"
                  className="folder-open"
                  onClick={() => openFolder(folder.id)}
                >
                  <span className="folder-icon" aria-hidden>
                    {isClassRoot ? '🏫' : '📁'}
                  </span>
                  <h3>{folder.name}</h3>
                </button>
                {showFolderActions && (
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
                      onClick={() => openMoveFolder(folder)}
                    >
                      Verschieben
                    </button>
                    {folder.scope !== 'class' && isTeacherOrMaster && (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={shareBusyId === folder.id}
                          onClick={() => void shareFolder(folder)}
                          title="Alle Dialoge im Ordner öffentlich freigeben"
                        >
                          {shareBusyId === folder.id
                            ? '…'
                            : shareCopiedId === folder.id
                              ? 'Link kopiert'
                              : 'Öffentlich'}
                        </button>
                        {dialogs.some(
                          (d) => d.folderId === folder.id && !d.classId && d.shareToken,
                        ) && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={shareBusyId === folder.id}
                            onClick={() => void stopShareFolder(folder)}
                          >
                            Freigabe beenden
                          </button>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-danger"
                      onClick={() => deleteFolder(folder)}
                    >
                      Löschen
                    </button>
                  </div>
                )}
              </article>
            )
          })}

          {childDialogs.map((d) => {
            const editable = canEditDialog(d)
            const isPersonal = !d.classId
            return (
              <article key={d.id} className="library-card dialog-card">
                <span
                  className="dialog-lang-flag"
                  title={languageName(d.targetLanguage)}
                  aria-label={languageName(d.targetLanguage)}
                >
                  <LanguageFlag code={d.targetLanguage} size="lg" />
                </span>
                <h3>{d.title}</h3>
                <p className="dialog-meta">
                  {languageName(d.targetLanguage)} · {d.sections.length} Abschnitt
                  {d.sections.length !== 1 ? 'e' : ''}
                </p>
                <div className="library-card-actions">
                  {editable ? (
                    <>
                      <Link to={`/dialog/${d.id}`} className="btn btn-secondary btn-sm">
                        Bearbeiten
                      </Link>
                      <Link
                        to={`/dialog/${d.id}/slideshow`}
                        className="btn btn-secondary btn-sm"
                      >
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
                        onClick={() => openMoveDialog(d)}
                      >
                        Verschieben
                      </button>
                      {isPersonal && isTeacherOrMaster && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={shareBusyId === d.id}
                          onClick={() => void shareDialog(d)}
                          title="Öffentlich teilen — Link + Eintrag unter Öffentliche Dialoge"
                        >
                          {shareBusyId === d.id
                            ? '…'
                            : shareCopiedId === d.id
                              ? 'Link kopiert'
                              : d.shareToken
                                ? 'Link kopieren'
                                : 'Teilen'}
                        </button>
                      )}
                      {isPersonal && isTeacherOrMaster && d.shareToken && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={shareBusyId === d.id}
                          onClick={() => void stopSharing(d)}
                        >
                          Freigabe beenden
                        </button>
                      )}
                      {isPersonal && hasClassFolders && isTeacherOrMaster && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => openCopyToClass(d)}
                        >
                          In Klasse kopieren
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-danger"
                        onClick={() => deleteDialog(d)}
                      >
                        Löschen
                      </button>
                    </>
                  ) : (
                    <>
                      <Link to={`/dialog/${d.id}`} className="btn btn-secondary btn-sm">
                        Ansehen
                      </Link>
                      <Link
                        to={`/dialog/${d.id}/slideshow`}
                        className="btn btn-secondary btn-sm"
                      >
                        Diashow
                      </Link>
                    </>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {moveItem && (
        <div className="modal-backdrop" onClick={() => setMoveItem(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Verschieben</h2>
            <p className="muted">„{moveItem.name}" nach:</p>
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

      {copyDialog && (
        <div className="modal-backdrop" onClick={() => !copyBusy && setCopyDialog(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>In Klasse kopieren</h2>
            <p className="muted">
              „{copyDialog.title}" in einen Klassenordner kopieren:
            </p>
            <select
              className="input"
              value={copyTargetFolderId}
              onChange={(e) => setCopyTargetFolderId(e.target.value)}
            >
              {classFoldersForCopy.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folderLabel(folder.id, folders)}
                </option>
              ))}
            </select>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={copyBusy}
                onClick={() => setCopyDialog(null)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={copyBusy || !copyTargetFolderId}
                onClick={confirmCopyToClass}
              >
                {copyBusy ? 'Kopiere …' : 'Kopieren'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
