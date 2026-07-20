import type { DialogLine } from '../types'
import { isRtlLanguage } from '../types'

interface BirkenbihlLineProps {
  line: DialogLine
  targetLanguage?: string
  nativeLanguage?: string
  highlightWordIndex?: number | null
  /** Zielschrift (z. B. Persisch) anzeigen. */
  showTargetText?: boolean
  /** Lautschrift in lateinischen Buchstaben anzeigen (falls vorhanden). */
  showRomanization?: boolean
  /** Übersetzung / Muttersprache anzeigen. */
  showTranslation?: boolean
}

export function BirkenbihlLine({
  line,
  targetLanguage,
  nativeLanguage,
  highlightWordIndex,
  showTargetText = true,
  showRomanization = true,
  showTranslation = true,
}: BirkenbihlLineProps) {
  const targetRtl = targetLanguage ? isRtlLanguage(targetLanguage) : false
  const nativeRtl = nativeLanguage ? isRtlLanguage(nativeLanguage) : false

  if (!line.birkenbihl?.length) {
    if (!showTargetText) return null
    return (
      <p
        className="dialog-line-text"
        dir={targetRtl ? 'rtl' : undefined}
        lang={targetLanguage}
      >
        {line.text.split(/(\s+)/).map((w, i) => (
          <span
            key={i}
            className={
              highlightWordIndex !== null &&
              highlightWordIndex !== undefined &&
              Math.floor(i / 2) === highlightWordIndex
                ? 'word-highlight'
                : undefined
            }
          >
            {w}
          </span>
        ))}
      </p>
    )
  }

  const visible = line.birkenbihl.some(
    (w) =>
      (showTargetText && w.text) ||
      (showRomanization && w.romanization) ||
      (showTranslation && w.translation),
  )
  if (!visible) return null

  return (
    <div
      className={`birkenbihl-line ${targetRtl ? 'birkenbihl-line--rtl' : ''}`}
      dir={targetRtl ? 'rtl' : 'ltr'}
      lang={targetLanguage}
    >
      <div className="birkenbihl-words">
        {line.birkenbihl.map((w, i) => {
          const hasAny =
            (showTargetText && w.text) ||
            (showRomanization && w.romanization) ||
            (showTranslation && w.translation)
          if (!hasAny) return null
          return (
            <span
              key={i}
              className={`birkenbihl-word ${highlightWordIndex === i ? 'word-highlight' : ''}`}
            >
              {showTargetText ? <span className="birkenbihl-top">{w.text}</span> : null}
              {showRomanization && w.romanization ? (
                <span className="birkenbihl-roman" lang="de">
                  {w.romanization}
                </span>
              ) : null}
              {showTranslation ? (
                <span
                  className={`birkenbihl-bottom ${nativeRtl ? 'birkenbihl-bottom--rtl' : ''}`}
                  dir={nativeRtl ? 'rtl' : 'ltr'}
                  lang={nativeLanguage}
                >
                  {w.translation}
                </span>
              ) : null}
            </span>
          )
        })}
      </div>
    </div>
  )
}
