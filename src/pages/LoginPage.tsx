import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { loginGoogle, loginStudent, firebaseReady } = useAuth()
  const [classCode, setClassCode] = useState('')
  const [studentCode, setStudentCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await loginStudent(studentCode, name || undefined, classCode || undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError('')
    setLoading(true)
    try {
      await loginGoogle()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google-Anmeldung fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  if (!firebaseReady) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Zebla</h1>
          <div className="alert alert-error">
            Firebase ist nicht konfiguriert. Bitte VITE_FIREBASE_* Variablen in .env
            setzen (siehe README).
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Zebla</h1>
        <p className="login-subtitle">
          Sprachdialoge erstellen, übersetzen und lernen – mit KI.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <section className="login-section">
          <h2>Als Lehrkraft / Master</h2>
          <p className="hint">
            Mit Google anmelden. Neue Lehrkräfte registrieren sich selbst; KI braucht später Pro.
          </p>
          <button
            type="button"
            className="btn btn-secondary google-btn"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            Mit Google anmelden
          </button>
        </section>

        <div className="divider">
          <span>oder</span>
        </div>

        <section className="login-section">
          <h2>Als Schüler anmelden</h2>
          <form onSubmit={handleStudentLogin} className="student-form">
            <label>
              Klassencode
              <input
                type="text"
                value={classCode}
                onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                placeholder="von der Lehrkraft"
                autoComplete="off"
              />
            </label>
            <label>
              Schülercode
              <input
                type="text"
                value={studentCode}
                onChange={(e) => setStudentCode(e.target.value.toUpperCase())}
                placeholder="persönlicher Code"
                required
                autoComplete="off"
              />
            </label>
            <label>
              Anzeigename (optional)
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Max M."
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Anmelden …' : 'Mit Codes anmelden'}
            </button>
          </form>
          <p className="hint">
            Klassencode + Schülercode erhältst du von der Lehrkraft. Alte Demo-Codes ohne Klasse
            funktionieren weiter nur mit Schülercode.
          </p>
        </section>
      </div>
    </div>
  )
}
