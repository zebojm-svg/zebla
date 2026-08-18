import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  getUiLanguage,
  setUiLanguage as persistUiLanguage,
  type UiLanguage,
} from '../lib/preferences'
import { isRtlUi, translate, type MessageKey } from './messages'

interface I18nContextValue {
  lang: UiLanguage
  setLang: (lang: UiLanguage) => void
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  dir: 'ltr' | 'rtl'
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UiLanguage>(() => getUiLanguage())

  const setLang = (next: UiLanguage) => {
    setLangState(next)
    persistUiLanguage(next)
  }

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = isRtlUi(lang) ? 'rtl' : 'ltr'
  }, [lang])

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
      dir: isRtlUi(lang) ? 'rtl' : 'ltr',
    }),
    [lang],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
