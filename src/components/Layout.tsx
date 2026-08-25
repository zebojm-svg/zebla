import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LanguageSwitcher } from './LanguageSwitcher'

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const isSlideshow = location.pathname.includes('/slideshow')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const roleLabel =
    user?.role === 'master'
      ? 'Master'
      : user?.role === 'teacher'
        ? user.proActive
          ? 'Lehrkraft · Pro'
          : 'Lehrkraft'
        : 'Schüler'

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const tabClass = (path: string) =>
    location.pathname.startsWith(path) ? 'zebo-tab is-active' : 'zebo-tab'

  return (
    <div className="layout">
      {!isSlideshow && (
        <header className="zebo-shell-header">
          <div className="zebo-shell-header__left">
            <Link to="/" className="zebo-tool-pill">
              <img src="/apple-touch-icon.png" alt="" className="zebo-tool-pill__icon" width={28} height={28} />
              <span className="zebo-tool-pill__name">Zebla</span>
            </Link>
          </div>
          {user && (
            <>
              {(user.role === 'teacher' || user.role === 'master') && (
                <nav className="zebo-shell-header__nav zebo-tabs" aria-label="Hauptnavigation">
                  <Link to="/library" className={tabClass('/library')}>
                    Bibliothek
                  </Link>
                  <Link to="/story" className={tabClass('/story')}>
                    Zeichnen
                  </Link>
                  <Link to="/explore" className={tabClass('/explore')}>
                    Öffentlich
                  </Link>
                  <Link to="/classes" className={tabClass('/classes')}>
                    Klassen
                  </Link>
                  <Link to="/pro" className={tabClass('/pro')}>
                    Pro
                  </Link>
                </nav>
              )}
              <div className="zebo-shell-header__right">
                <Link to="/library" className="btn btn-story-studio btn-sm">
                  Bibliothek
                </Link>
                <LanguageSwitcher className="lang-switcher--topbar" />
                <a className="zebo-hub-link" href="https://zebotools.ch">
                  ← ZeboTools
                </a>
                <div ref={menuRef} className="zebo-user-menu">
                  <button
                    type="button"
                    className={`zebo-user-menu__trigger zebo-user-menu__trigger--${user.role}`}
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                    onClick={() => setMenuOpen((v) => !v)}
                  >
                    {user.name} ▾
                  </button>
                  {menuOpen ? (
                    <div className="zebo-user-menu__panel" role="menu">
                      <div className="zebo-user-menu__copy">
                        <div style={{ fontWeight: 600 }}>{roleLabel}</div>
                      </div>
                      <hr className="zebo-user-menu__separator" />
                      <button
                        type="button"
                        className="zebo-user-menu__item"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false)
                          void logout().then(() => navigate('/login'))
                        }}
                      >
                        Als anderer Benutzer anmelden
                      </button>
                      <button
                        type="button"
                        className="zebo-user-menu__item"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false)
                          void logout()
                        }}
                      >
                        Abmelden
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}
          {!user && (
            <div className="zebo-shell-header__right">
              <LanguageSwitcher className="lang-switcher--topbar" />
              <a className="zebo-hub-link" href="https://zebotools.ch">
                ← ZeboTools
              </a>
            </div>
          )}
        </header>
      )}
      <main className={isSlideshow ? 'main-full' : 'main'}>{children}</main>
    </div>
  )
}
