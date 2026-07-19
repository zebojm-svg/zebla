import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithCustomToken,
  signOut,
  GoogleAuthProvider,
} from 'firebase/auth'
import { auth, isFirebaseConfigured } from '../lib/firebase'
import { api, setAuthTokenGetter } from '../api/client'
import type { User } from '../types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  loginGoogle: () => Promise<void>
  loginStudent: (code: string, name?: string) => Promise<void>
  logout: () => Promise<void>
  firebaseReady: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const firebaseReady = isFirebaseConfigured()

  useEffect(() => {
    if (!firebaseReady) {
      setLoading(false)
      return
    }

    setAuthTokenGetter(async () => {
      const current = auth.currentUser
      if (!current) return null
      return current.getIdToken()
    })

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null)
        setLoading(false)
        return
      }

      try {
        const { user: profile } = await api.auth.sync(
          fbUser.displayName ?? undefined,
        )
        setUser(profile)
      } catch {
        setUser({
          id: fbUser.uid,
          name: fbUser.displayName ?? 'Nutzer',
          email: fbUser.email ?? undefined,
          authType: fbUser.providerData.some((p) => p.providerId === 'google.com')
            ? 'google'
            : 'student',
        })
      } finally {
        setLoading(false)
      }
    })

    return unsubscribe
  }, [firebaseReady])

  const loginGoogle = async () => {
    const provider = new GoogleAuthProvider()
    try {
      await signInWithPopup(auth, provider)
    } catch (err) {
      throw new Error(friendlyAuthError(err))
    }
  }

  const loginStudent = async (code: string, name?: string) => {
    try {
      const { customToken } = await api.auth.student(code, name)
      await signInWithCustomToken(auth, customToken)
    } catch (err) {
      throw new Error(friendlyAuthError(err))
    }
  }

  const logout = async () => {
    await signOut(auth)
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, loginGoogle, loginStudent, logout, firebaseReady }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider sein')
  return ctx
}

function friendlyAuthError(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: string }).code)
      : ''
  const message = err instanceof Error ? err.message : ''

  if (
    code === 'auth/unauthorized-domain' ||
    /unauthorized.?domain/i.test(message)
  ) {
    return (
      'Diese Website-Domain ist in Firebase nicht freigeschaltet. ' +
      'In der Firebase Console unter Authentication → Settings → Authorized domains ' +
      'bitte „zebla.vercel.app“ hinzufügen. Bis dahin mit Schülercode anmelden ' +
      '(z.B. DEMO123).'
    )
  }
  if (code === 'auth/popup-blocked') {
    return 'Pop-up wurde blockiert. Bitte Pop-ups für diese Seite erlauben und erneut versuchen.'
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Google-Anmeldung abgebrochen.'
  }
  if (code === 'auth/network-request-failed') {
    return 'Netzwerkfehler bei der Anmeldung. Bitte Verbindung prüfen und erneut versuchen.'
  }
  if (/ungültiger schülercode/i.test(message)) {
    return 'Ungültiger Schülercode. Demo-Codes: DEMO123, KLASSE7A, SCHUELER2024'
  }
  return message || 'Anmeldung fehlgeschlagen'
}
