import { LanguageFlag } from './LanguageFlag'
import { languageName } from '../types'

type Props = {
  source: string
  target: string
  size?: 'md' | 'lg'
}

export function LanguagePairFlags({ source, target, size = 'lg' }: Props) {
  return (
    <span className="lang-pair-flags" title={`${languageName(source)} → ${languageName(target)}`}>
      <LanguageFlag code={source} size={size} decorative={false} />
      <span className="lang-pair-flags__arrow" aria-hidden>
        →
      </span>
      <LanguageFlag code={target} size={size} decorative={false} />
    </span>
  )
}
