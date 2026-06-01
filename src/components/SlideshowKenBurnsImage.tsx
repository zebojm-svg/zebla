import { useMemo } from 'react'
import { estimateLineDurationSec, PORTRAIT_KEN_BURNS_ZOOM } from '../lib/kenBurns'

interface SlideshowKenBurnsImageProps {
  imageUrl: string
  speaker: string
  lineText: string
  rate: number
  /** Während Sprachausgabe: sanfter Zoom. */
  animate: boolean
}

export function SlideshowKenBurnsImage({
  imageUrl,
  speaker,
  lineText,
  rate,
  animate,
}: SlideshowKenBurnsImageProps) {
  const durationSec = useMemo(
    () => estimateLineDurationSec(lineText, rate),
    [lineText, rate],
  )

  return (
    <div className="slideshow-image-kenburns">
      <img
        key={`${imageUrl}-${speaker}-${animate ? 'play' : 'still'}`}
        src={imageUrl}
        alt=""
        className={`slideshow-image slideshow-kenburns ${animate ? 'slideshow-kenburns--portrait' : 'slideshow-kenburns--still'}`}
        style={{
          transformOrigin: '50% 42%',
          animationDuration: animate ? `${Math.max(1.2, durationSec)}s` : undefined,
          ['--kenburns-end-scale' as string]: String(1 + PORTRAIT_KEN_BURNS_ZOOM),
        }}
      />
    </div>
  )
}
