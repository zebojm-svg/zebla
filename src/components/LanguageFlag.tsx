import { languageCountryCode, languageName } from '../types'

type LanguageFlagProps = {
  code: string
  /** visual size; tile corners use large */
  size?: 'sm' | 'md' | 'lg'
  className?: string
  title?: string
  /** decorative (default true) — hide from AT when next to language name */
  decorative?: boolean
}

const SIZE_PX: Record<NonNullable<LanguageFlagProps['size']>, number> = {
  sm: 16,
  md: 22,
  lg: 36,
}

/**
 * PNG-Flaggen via flagcdn.com — auf Windows rendern Emoji-Flaggen oft nur als
 * Buchstaben (FR, RU, KR). Bilder funktionieren überall.
 */
export function LanguageFlag({
  code,
  size = 'md',
  className,
  title,
  decorative = true,
}: LanguageFlagProps) {
  const country = languageCountryCode(code)
  const label = title ?? languageName(code)
  const px = SIZE_PX[size]
  // w80 liefert schärfere Flags auf Retina; CSS skaliert auf px
  const src = `https://flagcdn.com/w80/${country}.png`

  return (
    <img
      src={src}
      alt={decorative ? '' : label}
      title={label}
      width={px}
      height={Math.round(px * 0.75)}
      className={['lang-flag-img', `lang-flag-img--${size}`, className].filter(Boolean).join(' ')}
      loading="lazy"
      decoding="async"
      aria-hidden={decorative ? true : undefined}
      draggable={false}
    />
  )
}
