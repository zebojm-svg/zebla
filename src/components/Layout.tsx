import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const isSlideshow = location.pathname.includes('/slideshow')

  return (
    <div className="layout">
      {!isSlideshow && (
        <header className="topbar">
          <Link to="/" className="brand">
            Zebla
          </Link>
          {user && (
            <div className="topbar-actions">
              <span className="user-badge">{user.name}</span>
              <button type="button" className="btn btn-ghost" onClick={() => logout()}>
                Abmelden
              </button>
            </div>
          )}
        </header>
      )}
      <main className={isSlideshow ? 'main-full' : 'main'}>{children}</main>
    </div>
  )
}
