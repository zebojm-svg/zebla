import type { DialogLine } from '../types'
import { isRtlLanguage } from '../types'

interface BirkenbihlLineProps {
  line: DialogLine
  targetLanguage?: string
  nativeLanguage?: string
  highlightWordIndex?: number | null
}

export function BirkenbihlLine({
  line,
  targetLanguage,
  nativeLanguage,
  highlightWordIndex,
}: BirkenbihlLineProps) {
  const targetRtl = targetLanguage ? isRtlLanguage(targetLanguage) : false
  const nativeRtl = nativeLanguage ? isRtlLanguage(nativeLanguage) : false

  if (!line.birkenbihl?.length) {
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

  return (
    <div
      className={`birkenbihl-line ${targetRtl ? 'birkenbihl-line--rtl' : ''}`}
      dir={targetRtl ? 'rtl' : 'ltr'}
      lang={targetLanguage}
    >
      <div className="birkenbihl-words">
        {line.birkenbihl.map((w, i) => (
          <span
            key={i}
            className={`birkenbihl-word ${highlightWordIndex === i ? 'word-highlight' : ''}`}
          >
            <span className="birkenbihl-top">{w.text}</span>
            <span
              className={`birkenbihl-bottom ${nativeRtl ? 'birkenbihl-bottom--rtl' : ''}`}
              dir={nativeRtl ? 'rtl' : 'ltr'}
              lang={nativeLanguage}
            >
              {w.translation}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
