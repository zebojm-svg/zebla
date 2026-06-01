import { useMemo } from 'react'
import {
  estimateLineDurationSec,
  kenBurnsFocusX,
  type SpeakerSide,
} from '../lib/kenBurns'

interface SlideshowKenBurnsImageProps {
  imageUrl: string
  speaker: string
  speakerSide: SpeakerSide
  lineText: string
  rate: number
  /** Während Sprachausgabe: langsamer Zoom. */
  animate: boolean
}

export function SlideshowKenBurnsImage({
  imageUrl,
  speaker,
  speakerSide,
  lineText,
  rate,
  animate,
}: SlideshowKenBurnsImageProps) {
  const durationSec = useMemo(
    () => estimateLineDurationSec(lineText, rate),
    [lineText, rate],
  )

  const origin = `${Math.round(kenBurnsFocusX(speakerSide) * 100)}% 50%`
  const animClass =
    speakerSide === 'left'
      ? 'slideshow-kenburns--left'
      : speakerSide === 'right'
        ? 'slideshow-kenburns--right'
        : 'slideshow-kenburns--center'

  return (
    <div className="slideshow-image-kenburns">
      <img
        key={`${imageUrl}-${speaker}-${animate ? 'play' : 'still'}`}
        src={imageUrl}
        alt=""
        className={`slideshow-image slideshow-kenburns ${animate ? animClass : 'slideshow-kenburns--still'}`}
        style={{
          transformOrigin: origin,
          animationDuration: animate ? `${Math.max(1.2, durationSec)}s` : undefined,
        }}
      />
    </div>
  )
}
