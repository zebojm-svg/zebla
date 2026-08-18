import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { signInWithCustomToken } from 'firebase/auth'
import { auth, isFirebaseConfigured } from '../lib/firebase'

function sanitizeNext(raw: string | null): string {
  const next = (raw ?? '').trim() || '/'
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('://')) {
    return '/'
  }
  return next
}

export function SsoPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = params.get('token')
    const next = sanitizeNext(params.get('next'))
    if (!isFirebaseConfigured()) {
      setError('Firebase ist nicht konfiguriert.')
      return
    }
    if (!token) {
      setError('Kein SSO-Token.')
      return
    }
    let cancelled = false
    void (async () => {
      try {
        await signInWithCustomToken(auth, token)
        if (!cancelled) navigate(next, { replace: true })
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'SSO fehlgeschlagen.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [params, navigate])

  return (
    <div className="login-page">
      <div className="login-card" style={{ textAlign: 'center' }}>
        {error ? (
          <>
            <p className="error-box">{error}</p>
            <Link to="/login">Zur Anmeldung</Link>
          </>
        ) : (
          <p>Anmeldung über ZeboTools …</p>
        )}
      </div>
    </div>
  )
}
