import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="page-center">
        <p className="muted">Lade …</p>
      </div>
    )
  }

  if (!user) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?redirect=${encodeURIComponent(next)}`} replace />
  }
  return <Outlet />
}

export function PublicOnlyRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="page-center">
        <p className="muted">Lade …</p>
      </div>
    )
  }

  if (user) {
    const redirect = new URLSearchParams(location.search).get('redirect')
    return <Navigate to={redirect || '/'} replace />
  }
  return <Outlet />
}
