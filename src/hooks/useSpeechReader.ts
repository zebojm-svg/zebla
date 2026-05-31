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
  fa: 'fa-AF',
  ru: 'ru-RU',
  sv: 'sv-SE',
  da: 'da-DK',
  no: 'nb-NO',
  el: 'el-GR',
  cs: 'cs-CZ',
  hu: 'hu-HU',
  ko: 'ko-KR',
}

/** Fallback-Reihenfolge wenn die Browser-Stimme ein anderes Locale nutzt (z. B. Dari = fa-AF). */
const SPEECH_LANG_LOCALES: Record<string, string[]> = {
  fa: ['fa-AF', 'fa-IR', 'fa'],
  ar: ['ar-SA', 'ar-AE', 'ar-EG', 'ar'],
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
  fa: {
    female: ['dari', 'farah', 'yasmin', 'hoda', 'zira', 'persian'],
    male: ['dari', 'farid', 'malek', 'mehdi', 'naayf', 'persian'],
  },
  ar: {
    female: ['hoda', 'salma', 'zira', 'layla'],
    male: ['naayf', 'hamid', 'tarik', 'moaz'],
  },
}

export interface SpeakLine {
  id: string
  text: string
  speaker: string
}

function normalizeVoiceLang(lang: string): string {
  return lang.replace('_', '-')
}

function langPrefix(languageCode: string): string {
  return languageCode.slice(0, 2).toLowerCase()
}

function matchesLang(voice: SpeechSynthesisVoice, prefix: string): boolean {
  return voiceLangPrefix(voice) === prefix.toLowerCase()
}

function voiceLangPrefix(voice: SpeechSynthesisVoice): string {
  return normalizeVoiceLang(voice.lang).split('-')[0].toLowerCase()
}

function localeRank(lang: string, languageCode: string): number {
  const normalized = normalizeVoiceLang(lang).toLowerCase()
  const preferred =
    SPEECH_LANG_LOCALES[languageCode] ??
    [SPEECH_LANG_MAP[languageCode] ?? languageCode].map((l) => l.toLowerCase())
  const idx = preferred.findIndex(
    (locale) => normalized === locale || normalized.startsWith(`${locale}-`),
  )
  return idx === -1 ? 99 : idx
}

function voicesForLanguage(
  voices: SpeechSynthesisVoice[],
  languageCode: string,
): SpeechSynthesisVoice[] {
  const prefix = langPrefix(languageCode)
  const matched = voices.filter((v) => matchesLang(v, prefix))
  return [...matched].sort(
    (a, b) => localeRank(a.lang, languageCode) - localeRank(b.lang, languageCode),
  )
}

function speechLocalesForLanguage(languageCode: string): string[] {
  const fromMap = SPEECH_LANG_LOCALES[languageCode] ?? [
    SPEECH_LANG_MAP[languageCode] ?? languageCode,
  ]
  return [...new Set(fromMap.map((l) => normalizeVoiceLang(l)))]
}

function pickVoiceForLocale(
  voices: SpeechSynthesisVoice[],
  locale: string,
): SpeechSynthesisVoice | undefined {
  const target = normalizeVoiceLang(locale).toLowerCase()
  return (
    voices.find((v) => normalizeVoiceLang(v.lang).toLowerCase() === target) ??
    voices.find((v) => normalizeVoiceLang(v.lang).toLowerCase().startsWith(`${target}-`)) ??
    voices.find((v) =>
      normalizeVoiceLang(v.lang).toLowerCase().startsWith(target.slice(0, 2)),
    )
  )
}

function estimateSpeechMs(text: string, rate: number): number {
  const chars = text.replace(/\s/g, '').length || text.length
  return Math.min(12000, Math.max(1500, (chars / (9 * Math.max(rate, 0.4))) * 1000))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  const existing = window.speechSynthesis.getVoices()
  if (existing.length > 0) return existing

  return new Promise((resolve) => {
    let timer: number | undefined
    const finish = () => {
      const loaded = window.speechSynthesis.getVoices()
      if (loaded.length > 0) {
        window.speechSynthesis.onvoiceschanged = null
        if (timer !== undefined) window.clearTimeout(timer)
        resolve(loaded)
      }
    }
    window.speechSynthesis.onvoiceschanged = finish
    timer = window.setTimeout(() => {
      window.speechSynthesis.onvoiceschanged = null
      resolve(window.speechSynthesis.getVoices())
    }, 800)
  })
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
  const langVoices = voicesForLanguage(voices, languageCode)
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
    async (
      line: SpeakLine,
      speakerIndexMap: Map<string, number>,
      rate: number,
      highlightWords: boolean,
      allLines: SpeakLine[],
    ): Promise<void> => {
      if (stoppedRef.current) return

      const text = line.text.trim()
      if (!text) return

      ensureSpeakerVoices(allLines, speakerIndexMap)

      const assignedVoice = getVoiceForSpeaker(line.speaker)
      const locales = [
        assignedVoice ? normalizeVoiceLang(assignedVoice.lang) : null,
        ...speechLocalesForLanguage(languageCode),
      ].filter(Boolean) as string[]
      const uniqueLocales = [...new Set(locales)]

      setActiveLineId(line.id)

      for (const locale of uniqueLocales) {
        if (stoppedRef.current) return

        const spoke = await new Promise<boolean>((resolve) => {
          const utterance = new SpeechSynthesisUtterance(text)
          utterance.lang = locale
          utterance.rate = rate
          utterance.pitch = speakerPitchRef.current.get(line.speaker) ?? 1

          const localeVoice =
            pickVoiceForLocale(voicesRef.current, locale) ??
            (assignedVoice &&
            normalizeVoiceLang(assignedVoice.lang)
              .toLowerCase()
              .startsWith(locale.slice(0, 2).toLowerCase())
              ? assignedVoice
              : undefined)

          if (localeVoice) {
            utterance.voice = localeVoice
            utterance.lang = normalizeVoiceLang(localeVoice.lang)
          }

          let started = false
          let settled = false
          const startTime = performance.now()

          const finish = (success: boolean) => {
            if (settled) return
            settled = true
            resolve(success)
          }

          if (highlightWords) {
            utterance.onboundary = (event) => {
              if (event.name === 'word') {
                const before = text.slice(0, event.charIndex)
                const wordIdx = before.split(/\s+/).filter(Boolean).length
                setHighlightIndex(wordIdx)
              }
            }
            utterance.onstart = () => {
              started = true
              setHighlightIndex(0)
            }
          } else {
            utterance.onstart = () => {
              started = true
            }
            setHighlightIndex(null)
          }

          utterance.onend = () =>
            finish(started || performance.now() - startTime > 250)
          utterance.onerror = (event) => {
            finish(
              event.error !== 'interrupted' &&
                (started || performance.now() - startTime > 250),
            )
          }

          window.speechSynthesis.speak(utterance)

          window.setTimeout(() => {
            if (!settled && !started) finish(false)
          }, 500)
        })

        if (spoke) return
        window.speechSynthesis.cancel()
        await sleep(80)
      }

      if (!stoppedRef.current) {
        await sleep(estimateSpeechMs(text, rate))
      }
    },
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
      await sleep(120)
      stoppedRef.current = false

      voicesRef.current = await waitForVoices()
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
