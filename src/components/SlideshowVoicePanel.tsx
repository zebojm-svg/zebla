import { useState } from 'react'
import { api } from '../api/client'
import type { Dialog } from '../types'
import { uniqueSpeakersInDialog, speakerGender } from '../../shared/speakers'
import {
  voiceChoicesForLanguage,
  usesGeminiVoicePicker,
} from '../../shared/voice-options'

type Props = {
  dialog: Dialog
  setDialog: (d: Dialog) => void
  disabled?: boolean
  onStatus: (msg: string) => void
}

export function SlideshowVoicePanel({ dialog, setDialog, disabled, onStatus }: Props) {
  const [busySpeaker, setBusySpeaker] = useState<string | null>(null)
  const voices = voiceChoicesForLanguage(dialog.targetLanguage)
  const gemini = usesGeminiVoicePicker(dialog.targetLanguage)

  const updateProfile = async (
    speaker: string,
    patch: { gender?: 'male' | 'female' | ''; voiceName?: string; voicePrompt?: string },
  ) => {
    const profiles = { ...(dialog.speakerProfiles ?? {}) }
    const cur = { ...(profiles[speaker] ?? {}) }
    if (patch.gender !== undefined) {
      if (patch.gender) cur.gender = patch.gender
      else delete cur.gender
    }
    if (patch.voiceName !== undefined) {
      if (patch.voiceName) cur.voiceName = patch.voiceName
      else delete cur.voiceName
    }
    if (patch.voicePrompt !== undefined) {
      const t = patch.voicePrompt.trim()
      if (t) cur.voicePrompt = t
      else delete cur.voicePrompt
    }
    if (Object.keys(cur).length) profiles[speaker] = cur
    else delete profiles[speaker]

    const { dialog: d } = await api.dialogs.update(dialog.id, {
      speakerProfiles: profiles,
    })
    setDialog(d)
  }

  const regenerate = async (speaker: string) => {
    setBusySpeaker(speaker)
    onStatus('')
    try {
      const { dialog: d, generated } = await api.tts.regenerateSpeaker(dialog.id, speaker)
      setDialog(d)
      onStatus(
        generated > 0
          ? `${generated} Zeile${generated !== 1 ? 'n' : ''} für „${speaker}“ neu gesprochen.`
          : `Keine Zeilen für „${speaker}“.`,
      )
    } catch (err) {
      onStatus(err instanceof Error ? err.message : 'Stimme konnte nicht erzeugt werden.')
    } finally {
      setBusySpeaker(null)
    }
  }

  const speakers = uniqueSpeakersInDialog(dialog)
  if (!speakers.length) return null

  return (
    <div className="slideshow-voice-panel panel">
      <h3 className="slideshow-voice-title">Stimmen pro Sprecher</h3>
      <p className="muted slideshow-voice-hint">
        Geschlecht und Stimme festlegen, dann „Stimme neu“ – wichtig z. B. für Koreanisch. Nach
        Änderung ggf. einmal „Audio neu erstellen“ für alle.
        {gemini ? ' Stil-Hinweis wirkt bei Gemini-TTS (Persisch).' : ''}
      </p>
      <div className="slideshow-voice-grid">
        {speakers.map((speaker) => {
          const profile = dialog.speakerProfiles?.[speaker]
          const assigned = dialog.speakerVoices?.[speaker]
          const gender = speakerGender(dialog, speaker) ?? assigned?.gender ?? 'female'
          return (
            <div key={speaker} className="slideshow-voice-card">
              <div className="slideshow-voice-card-head">
                <strong>{speaker}</strong>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={disabled || busySpeaker === speaker}
                  onClick={() => void regenerate(speaker)}
                >
                  {busySpeaker === speaker ? '…' : 'Stimme neu'}
                </button>
              </div>
              <label className="slideshow-voice-field">
                <span>Geschlecht</span>
                <select
                  value={profile?.gender ?? ''}
                  disabled={disabled || !!busySpeaker}
                  onChange={(e) => {
                    const val = e.target.value as 'male' | 'female' | ''
                    void updateProfile(speaker, { gender: val }).then(() =>
                      onStatus(
                        'Geschlecht gespeichert – „Stimme neu“ für diesen Sprecher klicken.',
                      ),
                    )
                  }}
                >
                  <option value="">Automatisch</option>
                  <option value="female">Weiblich</option>
                  <option value="male">Männlich</option>
                </select>
              </label>
              {voices.length > 0 && (
                <label className="slideshow-voice-field">
                  <span>Cloud-Stimme</span>
                  <select
                    value={profile?.voiceName ?? assigned?.voiceName ?? ''}
                    disabled={disabled || !!busySpeaker}
                    onChange={(e) => {
                      const voiceName = e.target.value
                      const choice = voices.find((v) => v.name === voiceName)
                      void updateProfile(speaker, {
                        voiceName,
                        ...(choice ? { gender: choice.gender } : {}),
                      }).then(() =>
                        onStatus('Stimme gewählt – „Stimme neu“ ausführen.'),
                      )
                    }}
                  >
                    <option value="">Standard ({gender === 'male' ? 'männlich' : 'weiblich'})</option>
                    {voices.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {gemini && (
                <label className="slideshow-voice-field">
                  <span>Stil (Audio-Prompt)</span>
                  <input
                    type="text"
                    placeholder="z. B. warme tiefe Männerstimme, langsam"
                    value={profile?.voicePrompt ?? ''}
                    disabled={disabled || !!busySpeaker}
                    onBlur={(e) => {
                      void updateProfile(speaker, { voicePrompt: e.target.value })
                    }}
                  />
                </label>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
