import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { ClassRoom, StudentCodeInfo } from '../types'

export function ClassesPage() {
  const { user } = useAuth()
  const [classes, setClasses] = useState<ClassRoom[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [students, setStudents] = useState<StudentCodeInfo[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { classes: list } = await api.classes.list()
    setClasses(list)
    if (list.length && !selectedId) setSelectedId(list[0]!.id)
  }, [selectedId])

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : 'Fehler'))
      .finally(() => setLoading(false))
  }, [load])

  useEffect(() => {
    if (!selectedId) {
      setStudents([])
      return
    }
    api.classes
      .listStudents(selectedId)
      .then((res) => setStudents(res.students))
      .catch((err) => setError(err instanceof Error ? err.message : 'Fehler'))
  }, [selectedId])

  const createClass = async () => {
    const name = window.prompt('Name der Klasse:')
    if (!name?.trim()) return
    setError('')
    try {
      const { class: classroom } = await api.classes.create(name.trim())
      setClasses((prev) => [...prev, classroom].sort((a, b) => a.name.localeCompare(b.name, 'de')))
      setSelectedId(classroom.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Klasse konnte nicht erstellt werden.')
    }
  }

  const removeClass = async (id: string) => {
    if (!confirm('Klasse und alle Schülercodes löschen? Klassenordner bleiben in der Bibliothek.')) {
      return
    }
    setError('')
    try {
      await api.classes.delete(id)
      setClasses((prev) => prev.filter((c) => c.id !== id))
      if (selectedId === id) setSelectedId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.')
    }
  }

  const addStudent = async () => {
    if (!selectedId) return
    const label = window.prompt('Label (optional), z.B. Max M.:') ?? undefined
    setError('')
    try {
      const { student } = await api.classes.createStudent(selectedId, label || undefined)
      setStudents((prev) => [...prev, student].sort((a, b) => a.code.localeCompare(b.code)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Schülercode fehlgeschlagen.')
    }
  }

  const removeStudent = async (code: string) => {
    if (!confirm(`Schülercode ${code} löschen?`)) return
    setError('')
    try {
      await api.classes.deleteStudent(code)
      setStudents((prev) => prev.filter((s) => s.code !== code))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.')
    }
  }

  const selected = classes.find((c) => c.id === selectedId)

  if (user && user.role !== 'teacher' && user.role !== 'master') {
    return (
      <div className="page-center">
        <p>Klassenverwaltung ist nur für Lehrkräfte.</p>
        <Link to="/">Zur Bibliothek</Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="page-center">
        <p className="muted">Lade Klassen …</p>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <div className="page-header">
        <div>
          <h1>Klassen</h1>
          <p className="muted">
            Klassencode + Schülercodes vergeben. Im Klassenordner können Schüler Dialoge teilen.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={createClass}>
          + Klasse
        </button>
      </div>

      {error && <div className="alert alert-warn">{error}</div>}

      {!user?.proActive && user?.role === 'teacher' && (
        <div className="alert alert-warn">
          Ohne Pro ist KI für dich deaktiviert.{' '}
          <Link to="/pro">Pro freischalten</Link>
        </div>
      )}

      {classes.length === 0 ? (
        <div className="empty-state">
          <h2>Noch keine Klasse</h2>
          <p>Lege eine Klasse an und erzeuge Schülercodes für den Login.</p>
          <button type="button" className="btn btn-primary" onClick={createClass}>
            Erste Klasse anlegen
          </button>
        </div>
      ) : (
        <div className="classes-layout">
          <aside className="classes-list">
            {classes.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`class-item ${c.id === selectedId ? 'active' : ''}`}
                onClick={() => setSelectedId(c.id)}
              >
                <strong>{c.name}</strong>
                <span className="muted">Code: {c.classCode}</span>
              </button>
            ))}
          </aside>

          {selected && (
            <section className="class-detail panel">
              <div className="page-header">
                <div>
                  <h2>{selected.name}</h2>
                  <p className="muted">
                    Klassencode: <code>{selected.classCode}</code>
                  </p>
                </div>
                <div className="header-actions">
                  <Link
                    to={`/?folder=${selected.rootFolderId}`}
                    className="btn btn-secondary btn-sm"
                  >
                    Klassenordner
                  </Link>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-danger"
                    onClick={() => removeClass(selected.id)}
                  >
                    Klasse löschen
                  </button>
                </div>
              </div>

              <div className="page-header">
                <h3>Schülercodes</h3>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addStudent}>
                  + Schülercode
                </button>
              </div>

              {students.length === 0 ? (
                <p className="muted">Noch keine Codes – lege welche für deine Klasse an.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Label</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.code}>
                        <td>
                          <code>{s.code}</code>
                        </td>
                        <td>{s.label || '—'}</td>
                        <td>{s.userId ? 'eingeloggt' : 'frei'}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm btn-danger"
                            onClick={() => removeStudent(s.code)}
                          >
                            Löschen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
