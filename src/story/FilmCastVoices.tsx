import { useRef, useState } from 'react'
import { api } from '../api/client'
import type { Dialog } from '../types'
import { speakerGender, uniqueSpeakersInDialog } from '../../shared/speakers'
import { voiceChoicesForLanguage } from '../../shared/voice-options'

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

  if (speakers.length === 0) return null

  const stopPreview = () => {
    const el = previewRef.current
    if (!el) return
    el.pause()
    el.src = ''
    previewRef.current = null
  }

  const playPreview = async (
    speaker: string,
    voiceName: string,
    gender: 'male' | 'female',
  ) => {
    setBusy(`probe-${speaker}-${voiceName}`)
    setStatus('')
    stopPreview()
    try {
      const { audioBase64, mimeType } = await api.tts.preview({
        dialogId: dialog.id,
        speaker,
        voiceName,
        gender,
      })
      const el = new Audio(`data:${mimeType || 'audio/wav'};base64,${audioBase64}`)
      el.setAttribute('playsinline', 'true')
      previewRef.current = el
      el.onended = () => {
        if (previewRef.current === el) previewRef.current = null
      }
      await el.play()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Probe fehlgeschlagen.')
    } finally {
      setBusy(null)
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
        c.name === speaker ? { ...c, gender, voiceName } : c,
      )
      const { dialog: next } = await api.dialogs.update(dialog.id, {
        speakerProfiles: profiles,
        characterBible,
      })
      const { dialog: spoken } = await api.tts.regenerateSpeaker(dialog.id, speaker)
      onDialogUpdated(spoken ?? next)
      setStatus(`Stimme für ${speaker} gespeichert und neu gesprochen.`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Stimme konnte nicht gespeichert werden.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="film-cast-voices">
      <h2>Stimmen</h2>
      <p className="muted">
        Probesatz anhören, dann eine Stimme wählen. Bekannte Jungennamen (Ramo, Khan, Ubai,
        Schöme) bleiben männlich.
      </p>
      {status ? <p className="film-cast-voices-status">{status}</p> : null}
      <div className="film-cast-voices-grid">
        {speakers.map((speaker) => {
          const assigned = dialog.speakerVoices?.[speaker]
          const gender = speakerGender(dialog, speaker) ?? assigned?.gender ?? 'male'
          const current =
            dialog.speakerProfiles?.[speaker]?.voiceName || assigned?.voiceName || ''
          const choices =
            gender === 'male' ? voices.filter((v) => v.gender === 'male') : voices
          const shown = choices.length > 0 ? choices : voices
          return (
            <article key={speaker} className="film-cast-voice-card">
              <h3>
                {speaker}{' '}
                <span className="muted">{gender === 'male' ? 'männlich' : 'weiblich'}</span>
              </h3>
              <ul className="film-cast-voice-list">
                {shown.map((voice) => {
                  const selected = current === voice.name
                  const probeBusy = busy === `probe-${speaker}-${voice.name}`
                  const saveBusy = busy === `save-${speaker}`
                  return (
                    <li key={voice.name} className={selected ? 'is-selected' : undefined}>
                      <span>{voice.label}</span>
                      <span className="film-cast-voice-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={disabled || !!busy}
                          onClick={() => void playPreview(speaker, voice.name, voice.gender)}
                        >
                          {probeBusy ? '…' : 'Probe'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={disabled || !!busy}
                          onClick={() => void saveVoice(speaker, voice.name, voice.gender)}
                        >
                          {saveBusy && selected ? '…' : selected ? 'Gewählt' : 'Nehmen'}
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </article>
          )
        })}
      </div>
    </section>
  )
}
