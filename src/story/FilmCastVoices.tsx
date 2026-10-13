import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { Dialog } from '../types'
import {
  lookupSpeakerRecord,
  matchSpeakerName,
  speakerGender,
  uniqueSpeakersInDialog,
} from '../../shared/speakers'
import { voiceChoicesForLanguage } from '../../shared/voice-options'
import {
  decideVoiceProbe,
  isTtsQuotaError,
  nextGoogleProbeAt,
  probeNow,
  TTS_QUOTA_COOLDOWN_MS,
  TTS_QUOTA_MSG,
  ttsUserError,
  voiceProbeCacheKey,
  type ProbeSample,
} from '../../shared/voice-probe'

type Props = {
  dialog: Dialog
  disabled?: boolean
  onDialogUpdated: (dialog: Dialog) => void
}

export function FilmCastVoices({ dialog, disabled, onDialogUpdated }: Props) {
  const speakers = uniqueSpeakersInDialog(dialog)
  const voices = [...voiceChoicesForLanguage(dialog.targetLanguage)].sort((a, b) => {
    if (a.gender === b.gender) return a.label.localeCompare(b.label, 'de')
    return a.gender === 'male' ? -1 : 1
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const previewRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const cacheRef = useRef<Map<string, ProbeSample>>(new Map())
  const quotaUntilRef = useRef(0)
  const lastFetchAtRef = useRef(0)
  const runIdRef = useRef(0)

  const stopPreview = () => {
    const el = previewRef.current
    if (el) {
      el.onended = null
      el.onerror = null
      el.pause()
      el.removeAttribute('src')
      el.load()
      previewRef.current = null
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      runIdRef.current += 1
      stopPreview()
    }
  }, [])

  const playSample = (sample: ProbeSample) => {
    stopPreview()
    const binary = atob(sample.audioBase64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: sample.mimeType || 'audio/mpeg' })
    const url = URL.createObjectURL(blob)
    objectUrlRef.current = url
    const el = new Audio(url)
    el.setAttribute('playsinline', 'true')
    previewRef.current = el
    el.onended = () => {
      if (previewRef.current === el) stopPreview()
    }
    el.onerror = () => {
      if (previewRef.current === el) stopPreview()
    }
    void el.play().catch(() => {
      setStatus('Probe konnte nicht abgespielt werden. Nochmal Probe drücken.')
      if (previewRef.current === el) stopPreview()
    })
  }

  const playPreview = async (
    speaker: string,
    voiceName: string,
    gender: 'male' | 'female',
  ) => {
    const runId = ++runIdRef.current
    setBusy(`probe-${speaker}`)
    setStatus('')
    stopPreview()
    try {
      const key = voiceProbeCacheKey(voiceName, gender, dialog.targetLanguage)
      const decision = decideVoiceProbe({
        cache: cacheRef.current,
        key,
        now: probeNow(),
        quotaUntil: quotaUntilRef.current,
      })
      if (decision.action === 'play-cache') {
        playSample(decision.sample)
        return
      }
      if (decision.action === 'wait-quota') {
        setStatus(decision.message)
        return
      }
      const waitMs = nextGoogleProbeAt(lastFetchAtRef.current, probeNow())
      if (waitMs > 0) await new Promise((resolve) => window.setTimeout(resolve, waitMs))
      if (runId !== runIdRef.current) return
      lastFetchAtRef.current = probeNow()
      const { audioBase64, mimeType } = await api.tts.preview({
        dialogId: dialog.id,
        speaker,
        voiceName,
        gender,
      })
      if (runId !== runIdRef.current) return
      const sample: ProbeSample = {
        audioBase64,
        mimeType: mimeType || 'audio/mpeg',
      }
      cacheRef.current.set(key, sample)
      playSample(sample)
    } catch (err) {
      if (runId !== runIdRef.current) return
      const raw = err instanceof Error ? err.message : 'Probe fehlgeschlagen.'
      const msg = ttsUserError(raw)
      if (isTtsQuotaError(raw) || msg === TTS_QUOTA_MSG) {
        quotaUntilRef.current = probeNow() + TTS_QUOTA_COOLDOWN_MS
      }
      setStatus(msg)
      stopPreview()
    } finally {
      if (runId === runIdRef.current) setBusy(null)
    }
  }

  const saveVoice = async (
    speaker: string,
    voiceName: string,
    gender: 'male' | 'female',
  ) => {
    setBusy(`save-${speaker}`)
    setStatus('')
    try {
      const profiles = { ...(dialog.speakerProfiles ?? {}) }
      profiles[speaker] = {
        ...(profiles[speaker] ?? {}),
        gender,
        voiceName,
      }
      const characterBible = dialog.characterBible?.map((c) =>
        matchSpeakerName(c.name, speaker) ? { ...c, gender, voiceName } : c,
      )
      const speakerVoices = {
        ...(dialog.speakerVoices ?? {}),
        [speaker]: {
          ...(lookupSpeakerRecord(dialog.speakerVoices, speaker) ?? {}),
          gender,
          voiceName,
        },
      }
      const { dialog: next } = await api.dialogs.update(dialog.id, {
        speakerProfiles: profiles,
        characterBible,
        speakerVoices,
      })
      const { dialog: spoken } = await api.tts.regenerateSpeaker(dialog.id, speaker)
      onDialogUpdated(spoken ?? next)
      setStatus(`Stimme für ${speaker} gespeichert und neu gesprochen.`)
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Stimme konnte nicht gespeichert werden.'
      setStatus(ttsUserError(raw))
    } finally {
      setBusy(null)
    }
  }

  if (speakers.length === 0) return null

  return (
    <details className="film-cast-voices">
      <summary>Stimmen anpassen</summary>
      <p className="muted">
        Jederzeit Probe hören und eine Stimme wählen. Jungennamen bleiben männlich. Erzähler
        bekommt hier eine eigene Stimme — Handlung bleibt still.
      </p>
      {status ? <p className="film-cast-voices-status">{status}</p> : null}
      <div className="film-cast-voices-grid">
        {speakers.map((speaker) => {
          const assigned = lookupSpeakerRecord(dialog.speakerVoices, speaker)
          const chosen = lookupSpeakerRecord(dialog.speakerProfiles, speaker)
          const gender = speakerGender(dialog, speaker) ?? assigned?.gender ?? 'male'
          const current = chosen?.voiceName || assigned?.voiceName || ''
          const shown =
            gender === 'male' ? voices.filter((v) => v.gender === 'male') : voices
          const options = shown.length > 0 ? shown : voices
          const selected = options.find((v) => v.name === current) ?? options[0]
          return (
            <article key={speaker} className="film-cast-voice-card">
              <h3>
                {speaker}{' '}
                <span className="muted">{gender === 'male' ? 'männlich' : 'weiblich'}</span>
              </h3>
              <div className="film-cast-voice-row">
                <select
                  className="input"
                  value={selected?.name ?? ''}
                  disabled={disabled || !!busy}
                  onChange={(e) => {
                    const voice = options.find((v) => v.name === e.target.value)
                    if (voice) void saveVoice(speaker, voice.name, voice.gender)
                  }}
                >
                  {options.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={disabled || !!busy || !selected}
                  onClick={() =>
                    selected && void playPreview(speaker, selected.name, selected.gender)
                  }
                >
                  {busy === `probe-${speaker}` ? '…' : 'Probe'}
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </details>
  )
}
