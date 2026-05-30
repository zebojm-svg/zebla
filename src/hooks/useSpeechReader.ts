import { useCallback, useRef, useState } from 'react'

const SPEECH_LANG_MAP: Record<string, string> = {
  de: 'de-DE',
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  pt: 'pt-PT',
  nl: 'nl-NL',
  pl: 'pl-PL',
  tr: 'tr-TR',
  ja: 'ja-JP',
  zh: 'zh-CN',
  ar: 'ar-SA',
  ru: 'ru-RU',
  sv: 'sv-SE',
  da: 'da-DK',
  no: 'nb-NO',
  el: 'el-GR',
  cs: 'cs-CZ',
  hu: 'hu-HU',
  ko: 'ko-KR',
}

export function useSpeechReader(languageCode: string) {
  const [speaking, setSpeaking] = useState(false)
  const [activeLineId, setActiveLineId] = useState<string | null>(null)
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null)
  const stoppedRef = useRef(false)

  const stop = useCallback(() => {
    stoppedRef.current = true
    window.speechSynthesis.cancel()
    setSpeaking(false)
    setActiveLineId(null)
    setHighlightIndex(null)
  }, [])

  const speakText = useCallback(
    (
      text: string,
      lineId: string,
      rate: number,
      highlightWords: boolean,
    ): Promise<void> =>
      new Promise((resolve) => {
        if (stoppedRef.current) {
          resolve()
          return
        }

        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = SPEECH_LANG_MAP[languageCode] ?? languageCode
        utterance.rate = rate

        setActiveLineId(lineId)

        if (highlightWords) {
          utterance.onboundary = (event) => {
            if (event.name === 'word') {
              const before = text.slice(0, event.charIndex)
              const wordIdx = before.split(/\s+/).filter(Boolean).length
              setHighlightIndex(wordIdx)
            }
          }
          utterance.onstart = () => setHighlightIndex(0)
        } else {
          setHighlightIndex(null)
        }

        utterance.onend = () => resolve()
        utterance.onerror = () => resolve()
        window.speechSynthesis.speak(utterance)
      }),
    [languageCode],
  )

  const speakLines = useCallback(
    async (
      lines: { id: string; text: string }[],
      rate: number,
      highlightWords: boolean,
    ) => {
      stop()
      stoppedRef.current = false
      setSpeaking(true)

      for (const line of lines) {
        if (stoppedRef.current) break
        await speakText(line.text, line.id, rate, highlightWords)
      }

      setSpeaking(false)
      setActiveLineId(null)
      setHighlightIndex(null)
    },
    [speakText, stop],
  )

  const speakSingle = useCallback(
    (text: string, lineId: string, rate: number, highlightWords: boolean) => {
      stop()
      stoppedRef.current = false
      setSpeaking(true)
      speakText(text, lineId, rate, highlightWords).then(() => {
        setSpeaking(false)
        setActiveLineId(null)
        setHighlightIndex(null)
      })
    },
    [speakText, stop],
  )

  return { speakLines, speakSingle, stop, speaking, activeLineId, highlightIndex }
}

export const SPEECH_RATES = [
  { label: 'Langsam', value: 0.6 },
  { label: 'Normal', value: 0.85 },
  { label: 'Schnell', value: 1.1 },
] as const
