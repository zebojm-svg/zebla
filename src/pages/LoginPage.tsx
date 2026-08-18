import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { LanguageSwitcher } from '../components/LanguageSwitcher'

export function LoginPage() {
  const { loginGoogle, loginStudent, firebaseReady } = useAuth()
  const { t } = useI18n()
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
      setError(err instanceof Error ? err.message : t('common.error'))
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
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  if (!firebaseReady) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-lang-row">
            <LanguageSwitcher />
          </div>
          <h1>{t('brand.name')}</h1>
          <div className="alert alert-error">{t('login.firebaseMissing')}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-lang-row">
          <LanguageSwitcher />
        </div>
        <h1>{t('brand.name')}</h1>
        <p className="login-subtitle">{t('login.subtitle')}</p>

        {error && <div className="alert alert-error">{error}</div>}

        <section className="login-section">
          <h2>{t('login.googleTitle')}</h2>
          <p className="hint">
            Mit Google anmelden. Neue Lehrkräfte registrieren sich selbst; KI braucht später Pro.
          </p>
          <button
            type="button"
            className="btn btn-secondary google-btn"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            {t('login.googleBtn')}
          </button>
        </section>

        <div className="divider">
          <span>{t('common.or')}</span>
        </div>

        <section className="login-section">
          <h2>{t('login.studentTitle')}</h2>
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
              {t('login.studentCode')}
              <input
                type="text"
                value={studentCode}
                onChange={(e) => setStudentCode(e.target.value.toUpperCase())}
                placeholder={t('login.codePh')}
                required
                autoComplete="off"
              />
            </label>
            <label>
              {t('login.displayName')}
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('login.displayNamePh')}
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t('login.studentBusy') : t('login.studentBtn')}
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
