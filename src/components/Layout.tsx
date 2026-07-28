import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { LanguageSwitcher } from './LanguageSwitcher'

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const location = useLocation()
  const isSlideshow = location.pathname.includes('/slideshow')

  return (
    <div className="layout">
      {!isSlideshow && (
        <header className="topbar">
          <Link to="/" className="brand">
            {t('brand.name')}
          </Link>
          <div className="topbar-actions">
            <Link to="/explore" className="btn btn-ghost">
              {t('explore.nav')}
            </Link>
            {user && (
              <Link to="/" className="btn btn-ghost">
                {t('explore.myLibrary')}
              </Link>
            )}
            <LanguageSwitcher className="lang-switcher--topbar" />
            {user && (
              <>
                <span className="user-badge">{user.name}</span>
                <button type="button" className="btn btn-ghost" onClick={() => logout()}>
                  {t('nav.logout')}
                </button>
              </>
            )}
            {!user && (
              <Link to="/login" className="btn btn-ghost">
                {t('nav.login')}
              </Link>
            )}
          </div>
        </header>
      )}
      <main className={isSlideshow ? 'main-full' : 'main'}>{children}</main>
    </div>
  )
}
