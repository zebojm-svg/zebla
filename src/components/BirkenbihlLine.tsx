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
  /** Auf schmalen Screens zwei Zeilen (Lautschrift oben, Übersetzung unten). */
  splitRowsOnNarrow?: boolean
}

export function BirkenbihlLine({
  line,
  targetLanguage,
  nativeLanguage,
  highlightWordIndex,
  showTargetText = true,
  showRomanization = true,
  showTranslation = true,
  splitRowsOnNarrow = false,
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

  const words = line.birkenbihl
    .map((w, i) => ({ w, i }))
    .filter(
      ({ w }) =>
        (showTargetText && w.text) ||
        (showRomanization && w.romanization) ||
        (showTranslation && w.translation),
    )

  const stackedLine = (
    <div
      className={`birkenbihl-line birkenbihl-line--stacked ${targetRtl ? 'birkenbihl-line--rtl' : ''}`}
      dir={targetRtl ? 'rtl' : 'ltr'}
      lang={targetLanguage}
    >
      <div className="birkenbihl-words">
        {words.map(({ w, i }) => (
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
        ))}
      </div>
    </div>
  )

  if (!splitRowsOnNarrow) return stackedLine

  const showPrimaryRow = showTargetText || showRomanization
  const splitLine = (
    <div
      className={`birkenbihl-line birkenbihl-line--split-rows ${targetRtl ? 'birkenbihl-line--rtl' : ''}`}
      dir={targetRtl ? 'rtl' : 'ltr'}
      lang={targetLanguage}
    >
      {showPrimaryRow ? (
        <div className="birkenbihl-split-row birkenbihl-split-row--primary">
          {words.map(({ w, i }) => (
            <span
              key={i}
              className={`birkenbihl-split-token ${highlightWordIndex === i ? 'word-highlight' : ''}`}
            >
              {showTargetText && w.text ? (
                <span className="birkenbihl-top">{w.text}</span>
              ) : null}
              {showRomanization && w.romanization ? (
                <span className="birkenbihl-roman" lang="de">
                  {w.romanization}
                </span>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      {showTranslation ? (
        <div
          className={`birkenbihl-split-row birkenbihl-split-row--translation ${nativeRtl ? 'birkenbihl-split-row--rtl' : ''}`}
          dir={nativeRtl ? 'rtl' : 'ltr'}
          lang={nativeLanguage}
        >
          {words.map(({ w, i }) => (
            <span
              key={i}
              className={`birkenbihl-split-token ${highlightWordIndex === i ? 'word-highlight' : ''}`}
            >
              <span className="birkenbihl-bottom">{w.translation}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )

  return (
    <>
      {stackedLine}
      {splitLine}
    </>
  )
}
