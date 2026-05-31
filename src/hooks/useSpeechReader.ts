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
  fa: 'fa-IR',
  ru: 'ru-RU',
  sv: 'sv-SE',
  da: 'da-DK',
  no: 'nb-NO',
  el: 'el-GR',
  cs: 'cs-CZ',
  hu: 'hu-HU',
  ko: 'ko-KR',
}

/** Bevorzugte Stimmen pro Sprache (Name-Fragmente, bessere Qualität zuerst). */
const PREFERRED_VOICES: Record<string, { female: string[]; male: string[] }> = {
  ko: {
    female: ['heami', 'sunhi', 'yuna', 'sora'],
    male: ['injoon', 'hyunsu', 'bongjin', 'gook'],
  },
  ja: {
    female: ['nanami', 'aoi', 'shiori'],
    male: ['keita', 'daichi', 'ichiro'],
  },
  zh: {
    female: ['xiaoxiao', 'xiaoyi', 'hsiaochen'],
    male: ['yunxi', 'yunyang', 'kangkang'],
  },
  de: {
    female: ['katja', 'amala', 'elke'],
    male: ['conrad', 'stefan', 'killian'],
  },
  en: {
    female: ['aria', 'jenny', 'samantha', 'zira', 'hazel'],
    male: ['guy', 'ryan', 'david', 'mark', 'james'],
  },
  fr: {
    female: ['denise', 'eloise', 'hortense'],
    male: ['henri', 'claude', 'jerome'],
  },
  es: {
    female: ['elvira', 'lucia', 'sabina'],
    male: ['alvaro', 'pablo', 'jorge'],
  },
}

export interface SpeakLine {
  id: string
  text: string
  speaker: string
}

function langPrefix(languageCode: string): string {
  return (SPEECH_LANG_MAP[languageCode] ?? languageCode).slice(0, 2)
}

function matchesLang(voice: SpeechSynthesisVoice, prefix: string): boolean {
  return voice.lang.replace('_', '-').toLowerCase().startsWith(prefix.toLowerCase())
}

function nameIncludes(name: string, fragments: string[]): boolean {
  const n = name.toLowerCase()
  return fragments.some((f) => n.includes(f))
}

function isMaleVoice(v: SpeechSynthesisVoice): boolean {
  const n = v.name.toLowerCase()
  if (n.includes('female') && !n.includes('male')) return false
  return (
    (n.includes('male') && !n.includes('female')) ||
    nameIncludes(n, [
      'injoon',
      'hyunsu',
      'bongjin',
      'gook',
      'david',
      'mark',
      'james',
      'daniel',
      'thomas',
      'hans',
      'stefan',
      'alex',
      'paul',
      'george',
      'fred',
      'conrad',
      'guy',
      'ryan',
      'alvaro',
      'henri',
      'keita',
      'yunxi',
    ])
  )
}

function isFemaleVoice(v: SpeechSynthesisVoice): boolean {
  const n = v.name.toLowerCase()
  return (
    n.includes('female') ||
    nameIncludes(n, [
      'heami',
      'sunhi',
      'yuna',
      'sora',
      'nanami',
      'xiaoxiao',
      'katja',
      'amala',
      'aria',
      'jenny',
      'zira',
      'samantha',
      'hazel',
      'denise',
      'elvira',
      'anna',
      'helena',
      'linda',
      'maria',
    ])
  )
}

function guessSpeakerGender(speaker: string, speakerIndex: number): 'male' | 'female' {
  const s = speaker.toLowerCase()
  if (
    /\b(ben|max|tom|john|james|paul|mark|hans|peter|mike|david|alex|luke|tim|sam|chris|dan|min|jun|jin|hyun|joon|ho|seo)\b/.test(
      s,
    )
  )
    return 'male'
  if (
    /\b(anna|maria|sarah|lisa|emma|julia|sophie|elena|kate|amy|linda|laura|nina|sara|ji|yuna|min|hee|su|young|mi)\b/.test(
      s,
    )
  )
    return 'female'
  return speakerIndex % 2 === 0 ? 'female' : 'male'
}

function voiceQualityScore(
  voice: SpeechSynthesisVoice,
  gender: 'male' | 'female',
  languageCode: string,
): number {
  const n = voice.name.toLowerCase()
  let score = 0

  if (matchesLang(voice, langPrefix(languageCode))) score += 20

  const prefs = PREFERRED_VOICES[langPrefix(languageCode)]
  if (prefs) {
    const list = gender === 'male' ? prefs.male : prefs.female
    for (let i = 0; i < list.length; i++) {
      if (n.includes(list[i])) score += 80 - i * 5
    }
  }

  if (n.includes('neural') || n.includes('natural') || n.includes('online')) score += 45
  if (n.includes('microsoft')) score += 25
  if (n.includes('google') && n.includes('network')) score += 15
  if (gender === 'male' && isMaleVoice(voice)) score += 35
  if (gender === 'female' && isFemaleVoice(voice)) score += 35

  if (n.includes('espeak')) score -= 80
  if (n.includes('android') && !n.includes('network')) score -= 15
  if (n.includes('default')) score -= 10

  return score
}

function pickVoicesForSpeakers(
  voices: SpeechSynthesisVoice[],
  speakers: string[],
  speakerIndexMap: Map<string, number>,
  languageCode: string,
): Map<string, SpeechSynthesisVoice> {
  const prefix = langPrefix(languageCode)
  const langVoices = voices.filter((v) => matchesLang(v, prefix))
  const pool = langVoices.length > 0 ? langVoices : voices
  const used = new Set<string>()
  const result = new Map<string, SpeechSynthesisVoice>()

  for (const speaker of speakers) {
    const idx = speakerIndexMap.get(speaker) ?? 0
    const gender = guessSpeakerGender(speaker, idx)
    const ranked = [...pool].sort(
      (a, b) =>
        voiceQualityScore(b, gender, languageCode) -
        voiceQualityScore(a, gender, languageCode),
    )
    const voice =
      ranked.find((v) => !used.has(v.name)) ??
      ranked.find((v) => (gender === 'male' ? isMaleVoice(v) : isFemaleVoice(v))) ??
      ranked[0]
    if (voice) {
      result.set(speaker, voice)
      used.add(voice.name)
    }
  }

  return result
}

export function useSpeechReader(languageCode: string) {
  const [speaking, setSpeaking] = useState(false)
  const [activeLineId, setActiveLineId] = useState<string | null>(null)
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null)
  const stoppedRef = useRef(false)
  const speakerVoicesRef = useRef<Map<string, SpeechSynthesisVoice>>(new Map())
  const speakerPitchRef = useRef<Map<string, number>>(new Map())
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    speakerVoicesRef.current.clear()
    speakerPitchRef.current.clear()
  }, [languageCode])

  useEffect(() => {
    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices()
    }
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
    const t = window.setTimeout(loadVoices, 250)
    return () => {
      window.speechSynthesis.onvoiceschanged = null
      window.clearTimeout(t)
    }
  }, [])

  const stop = useCallback(() => {
    stoppedRef.current = true
    window.speechSynthesis.cancel()
    setSpeaking(false)
    setActiveLineId(null)
    setHighlightIndex(null)
  }, [])

  const ensureSpeakerVoices = useCallback(
    (lines: SpeakLine[], speakerIndexMap: Map<string, number>) => {
      const speakers = [...new Set(lines.map((l) => l.speaker))]
      const missing = speakers.some((s) => !speakerVoicesRef.current.has(s))
      if (!missing && speakerVoicesRef.current.size > 0) return

      const picked = pickVoicesForSpeakers(
        voicesRef.current,
        speakers,
        speakerIndexMap,
        languageCode,
      )
      speakerVoicesRef.current = picked

      const uniqueNames = new Set([...picked.values()].map((v) => v.name))
      if (uniqueNames.size === 1 && speakers.length > 1) {
        speakers.forEach((speaker, i) => {
          speakerPitchRef.current.set(speaker, i % 2 === 0 ? 1.05 : 0.9)
        })
      }
    },
    [languageCode],
  )

  const getVoiceForSpeaker = useCallback((speaker: string): SpeechSynthesisVoice | null => {
    return speakerVoicesRef.current.get(speaker) ?? null
  }, [])

  const speakText = useCallback(
    (
      line: SpeakLine,
      speakerIndexMap: Map<string, number>,
      rate: number,
      highlightWords: boolean,
      allLines: SpeakLine[],
    ): Promise<void> =>
      new Promise((resolve) => {
        if (stoppedRef.current) {
          resolve()
          return
        }

        ensureSpeakerVoices(allLines, speakerIndexMap)

        const utterance = new SpeechSynthesisUtterance(line.text)
        utterance.lang = SPEECH_LANG_MAP[languageCode] ?? languageCode
        utterance.rate = rate
        const voice = getVoiceForSpeaker(line.speaker)
        if (voice) utterance.voice = voice
        utterance.pitch = speakerPitchRef.current.get(line.speaker) ?? 1

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
    [ensureSpeakerVoices, getVoiceForSpeaker, languageCode],
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
      ensureSpeakerVoices(lines, speakerIndexMap)

      for (let i = startIndex; i < lines.length; i++) {
        if (stoppedRef.current) break
        onLineChange?.(i)
        const line = lines[i]
        await speakText(line, speakerIndexMap, rate, highlightWords, lines)
        if (!stoppedRef.current) onLineChange?.(i + 1)
      }

      setSpeaking(false)
      setActiveLineId(null)
      setHighlightIndex(null)
      return stoppedRef.current
    },
    [ensureSpeakerVoices, speakText, stop],
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
