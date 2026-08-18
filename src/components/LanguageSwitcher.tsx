import { UI_LANGUAGE_OPTIONS, type UiLanguage } from '../lib/preferences'
import { useI18n } from '../i18n/I18nContext'

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n()

  return (
    <label className={`lang-switcher ${className}`.trim()}>
      <span className="lang-switcher-label">{t('lang.ui')}</span>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as UiLanguage)}
        aria-label={t('lang.ui')}
      >
        {UI_LANGUAGE_OPTIONS.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}
