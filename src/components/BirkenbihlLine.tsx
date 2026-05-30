import type { DialogLine } from '../types'

interface BirkenbihlLineProps {
  line: DialogLine
  highlightWordIndex?: number | null
}

export function BirkenbihlLine({ line, highlightWordIndex }: BirkenbihlLineProps) {
  if (!line.birkenbihl?.length) {
    const words = line.text.split(/(\s+)/)
    return (
      <p className="dialog-line-text">
        {words.map((w, i) => (
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
    <div className="birkenbihl-line">
      <div className="birkenbihl-words">
        {line.birkenbihl.map((w, i) => (
          <span
            key={i}
            className={`birkenbihl-word ${highlightWordIndex === i ? 'word-highlight' : ''}`}
          >
            <span className="birkenbihl-top">{w.text}</span>
            <span className="birkenbihl-bottom">{w.translation}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
