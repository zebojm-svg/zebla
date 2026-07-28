import { languageFlag, languagePairLabel } from '../../shared/language-flags'
import { languageName } from '../types'

type Props = {
  sourceLanguage: string
  targetLanguage: string
  /** groß = Karten-Hero, compact = Meta-Zeile */
  size?: 'lg' | 'md' | 'sm'
  showNames?: boolean
  className?: string
}

export function LanguagePairFlags({
  sourceLanguage,
  targetLanguage,
  size = 'md',
  showNames = false,
  className = '',
}: Props) {
  const title = languagePairLabel(sourceLanguage, targetLanguage)
  return (
    <span
      className={`lang-pair-flags lang-pair-flags--${size} ${className}`.trim()}
      title={title}
      aria-label={title}
    >
      <span className="lang-pair-flag" aria-hidden>
        {languageFlag(sourceLanguage)}
      </span>
      <span className="lang-pair-arrow" aria-hidden>
        →
      </span>
      <span className="lang-pair-flag" aria-hidden>
        {languageFlag(targetLanguage)}
      </span>
      {showNames && (
        <span className="lang-pair-names">
          {languageName(sourceLanguage)} → {languageName(targetLanguage)}
        </span>
      )}
    </span>
  )
}
