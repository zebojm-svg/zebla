import { useCallback, useEffect, useRef, useState } from 'react'

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

export interface SpeakLine {
  id: string
  text: string
  speaker: string
}

function isMaleVoice(v: SpeechSynthesisVoice): boolean {
  const n = v.name.toLowerCase()
  return (
    (n.includes('male') && !n.includes('female')) ||
    /\b(david|mark|james|daniel|thomas|hans|stefan|alex|paul|george|fred|male)\b/.test(n)
  )
}

function isFemaleVoice(v: SpeechSynthesisVoice): boolean {
  const n = v.name.toLowerCase()
  return (
    n.includes('female') ||
    /\b(zira|samantha|anna|hazel|helena|katja|susan|linda|maria|victoria|female)\b/.test(n)
  )
}

function guessSpeakerGender(speaker: string, speakerIndex: number): 'male' | 'female' {
  const s = speaker.toLowerCase()
  if (/\b(ben|max|tom|john|james|paul|mark|hans|peter|mike|david|alex|luke|tim|sam|chris|dan)\b/.test(s))
    return 'male'
  if (/\b(anna|maria|sarah|lisa|emma|julia|sophie|elena|kate|amy|linda|laura|nina|sara)\b/.test(s))
    return 'female'
  return speakerIndex % 2 === 0 ? 'female' : 'male'
}

export function useSpeechReader(languageCode: string) {
  const [speaking, setSpeaking] = useState(false)
  const [activeLineId, setActiveLineId] = useState<string | null>(null)
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null)
  const stoppedRef = useRef(false)
  const speakerVoicesRef = useRef<Map<string, SpeechSynthesisVoice>>(new Map())
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices()
    }
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
    return () => {
      window.speechSynthesis.onvoiceschanged = null
    }
  }, [])

  const stop = useCallback(() => {
    stoppedRef.current = true
    window.speechSynthesis.cancel()
    setSpeaking(false)
    setActiveLineId(null)
    setHighlightIndex(null)
  }, [])

  const getVoiceForSpeaker = useCallback(
    (speaker: string, speakerIndex: number): SpeechSynthesisVoice | null => {
      const cached = speakerVoicesRef.current.get(speaker)
      if (cached) return cached

      const lang = SPEECH_LANG_MAP[languageCode] ?? languageCode
      const prefix = lang.slice(0, 2)
      const voices = voicesRef.current.filter((v) => v.lang.replace('_', '-').startsWith(prefix))
      const gender = guessSpeakerGender(speaker, speakerIndex)

      const preferred =
        gender === 'male'
          ? voices.find(isMaleVoice) ?? voices.find((v) => !isFemaleVoice(v))
          : voices.find(isFemaleVoice) ?? voices.find((v) => !isMaleVoice(v))

      const voice = preferred ?? voices[0] ?? null
      if (voice) speakerVoicesRef.current.set(speaker, voice)
      return voice
    },
    [languageCode],
  )

  const speakText = useCallback(
    (
      line: SpeakLine,
      speakerIndex: number,
      rate: number,
      highlightWords: boolean,
    ): Promise<void> =>
      new Promise((resolve) => {
        if (stoppedRef.current) {
          resolve()
          return
        }

        const utterance = new SpeechSynthesisUtterance(line.text)
        utterance.lang = SPEECH_LANG_MAP[languageCode] ?? languageCode
        utterance.rate = rate
        const voice = getVoiceForSpeaker(line.speaker, speakerIndex)
        if (voice) utterance.voice = voice

        setActiveLineId(line.id)

        if (highlightWords) {
          utterance.onboundary = (event) => {
            if (event.name === 'word') {
              const before = line.text.slice(0, event.charIndex)
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
    [getVoiceForSpeaker, languageCode],
  )

  const speakFrom = useCallback(
    async (
      lines: SpeakLine[],
      speakerIndexMap: Map<string, number>,
      startIndex: number,
      rate: number,
      highlightWords: boolean,
      onLineChange?: (index: number) => void,
    ): Promise<boolean> => {
      stop()
      stoppedRef.current = false
      setSpeaking(true)

      for (let i = startIndex; i < lines.length; i++) {
        if (stoppedRef.current) break
        onLineChange?.(i)
        const line = lines[i]
        await speakText(line, speakerIndexMap.get(line.speaker) ?? 0, rate, highlightWords)
        if (!stoppedRef.current) onLineChange?.(i + 1)
      }

      setSpeaking(false)
      setActiveLineId(null)
      setHighlightIndex(null)
      return stoppedRef.current
    },
    [speakText, stop],
  )

  return {
    speakFrom,
    stop,
    speaking,
    activeLineId,
    highlightIndex,
  }
}

export function buildSpeakerIndexMap(lines: SpeakLine[]): Map<string, number> {
  const map = new Map<string, number>()
  let idx = 0
  for (const line of lines) {
    if (!map.has(line.speaker)) {
      map.set(line.speaker, idx++)
    }
  }
  return map
}
