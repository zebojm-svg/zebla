import { inferDialogLineKind, type Dialog, type DialogLine, type DialogSection } from '../shared/types.js'
import { lineSpeechText, speechTextDiffersFromLineText } from '../shared/line-speech.js'
import { getDialog, updateDialog } from './firestore.js'
import { uploadLineAudio } from './audio-storage.js'
import { synthesizeSpeech } from './tts.js'
import {
  buildSpeakerVoiceProfiles,
  getSpeakerVoice,
  mergeVoiceProfilesIntoDialog,
  resolveSpeakerGender,
  ttsDeliveryForSpeaker,
} from './speaker-voice.js'
import { TTS_STORAGE_SPEAKING_RATE } from './tts-storage.js'
import { isGeminiTtsVoiceName, usesGeminiTts } from '../shared/tts-routing.js'

export function findLineInDialog(
  dialog: Dialog,
  lineId: string,
): { section: DialogSection; line: DialogLine; sectionIndex: number; lineIndex: number } | null {
  for (let si = 0; si < dialog.sections.length; si++) {
    const section = dialog.sections[si]
    const li = section.lines.findIndex((l) => l.id === lineId)
    if (li >= 0) return { section, line: section.lines[li], sectionIndex: si, lineIndex: li }
  }
  return null
}

function speakerIndexMap(dialog: Dialog): Map<string, number> {
  const map = new Map<string, number>()
  let idx = 0
  for (const section of dialog.sections) {
    for (const line of section.lines) {
      if (inferDialogLineKind(line) === 'action') continue
      if (!map.has(line.speaker)) {
        map.set(line.speaker, idx++)
      }
    }
  }
  return map
}

async function ensureSpeakerVoicesOnDialog(
  dialogId: string,
  userId: string,
  dialog: Dialog,
): Promise<Dialog> {
  const speakers = [...speakerIndexMap(dialog).keys()]
  const gemini = usesGeminiTts(dialog.targetLanguage)
  const hasAll = dialog.speakerVoices && speakers.every((s) => dialog.speakerVoices?.[s]?.voiceName)
  const needsGeminiRemap =
    gemini &&
    dialog.speakerVoices &&
    speakers.some((s) => !isGeminiTtsVoiceName(dialog.speakerVoices?.[s]?.voiceName))
  const needsMaleFix = speakers.some((s) => {
    const stored = dialog.speakerVoices?.[s]
    return (
      stored &&
      resolveSpeakerGender(s, 0, dialog.characterBible, dialog.speakerProfiles) === 'male' &&
      (stored.gender === 'female' || /kore|aoede|leda/i.test(stored.voiceName || ''))
    )
  })

  if (hasAll && !needsGeminiRemap && !needsMaleFix) {
    return dialog
  }
  const remapped = needsMaleFix
    ? speakers.filter((s) => {
        const stored = dialog.speakerVoices?.[s]
        return (
          stored &&
          resolveSpeakerGender(s, 0, dialog.characterBible, dialog.speakerProfiles) === 'male' &&
          (stored.gender === 'female' || /kore|aoede|leda/i.test(stored.voiceName || ''))
        )
      })
    : []
  const profiles = buildSpeakerVoiceProfiles(dialog)
  const merged = mergeVoiceProfilesIntoDialog(dialog, profiles)
  const patch =
    remapped.length > 0
      ? {
          ...merged,
          sections: dialog.sections.map((section) => ({
            ...section,
            lines: section.lines.map((line) =>
              remapped.includes(line.speaker) ? { ...line, audioUrl: undefined } : line,
            ),
          })),
        }
      : merged
  const updated = await updateDialog(dialogId, userId, patch)
  return updated ?? { ...dialog, ...patch }
}

export async function getOrCreateLineAudio(
  dialogId: string,
  userId: string,
  lineId: string,
  rate: number,
): Promise<{ audioUrl: string; cached: boolean; dialog: Dialog }> {
  let dialog = await getDialog(dialogId, userId)
  if (!dialog) throw new Error('Dialog nicht gefunden.')

  dialog = await ensureSpeakerVoicesOnDialog(dialogId, userId, dialog)

  const found = findLineInDialog(dialog, lineId)
  if (!found) throw new Error('Zeile nicht gefunden.')
  if (inferDialogLineKind(found.line) === 'action') {
    throw new Error('Handlung bleibt still — kein Sprachton.')
  }

  if (found.line.audioUrl && !speechTextDiffersFromLineText(found.line)) {
    return { audioUrl: found.line.audioUrl, cached: true, dialog }
  }

  const speakers = speakerIndexMap(dialog)
  const speakerIdx = speakers.get(found.line.speaker) ?? 0
  const voice = getSpeakerVoice(dialog, found.line.speaker)
  const delivery = ttsDeliveryForSpeaker(dialog, found.line.speaker)

  const tts = await synthesizeSpeech({
    text: lineSpeechText(found.line),
    languageCode: dialog.targetLanguage,
    rate: TTS_STORAGE_SPEAKING_RATE,
    gender: voice.gender,
    speakerIndex: speakerIdx,
    voiceName: voice.voiceName,
    voicePrompt: voice.voicePrompt || delivery.stylePrompt,
    pitch: delivery.pitch,
  })

  const audioUrl = await uploadLineAudio(tts.audioBase64, dialogId, lineId)

  const sections = dialog.sections.map((section, si) =>
    si === found.sectionIndex
      ? {
          ...section,
          lines: section.lines.map((line, li) =>
            li === found.lineIndex ? { ...line, audioUrl } : line,
          ),
        }
      : section,
  )

  const updated = await updateDialog(dialogId, userId, { sections })
  if (!updated) throw new Error('Dialog konnte nicht gespeichert werden.')

  return { audioUrl, cached: false, dialog: updated }
}

export interface EnsureAudioProgress {
  total: number
  done: number
  generated: number
  skipped: number
}

export async function ensureDialogAudio(
  dialogId: string,
  userId: string,
  rate: number,
  options?: { force?: boolean },
): Promise<{ dialog: Dialog; generated: number; skipped: number }> {
  const force = options?.force === true
  let dialog = await getDialog(dialogId, userId)
  if (!dialog) throw new Error('Dialog nicht gefunden.')

  dialog = await ensureSpeakerVoicesOnDialog(dialogId, userId, dialog)

  const speakers = speakerIndexMap(dialog)
  let generated = 0
  let skipped = 0

  for (const section of dialog.sections) {
    for (const line of section.lines) {
      if (inferDialogLineKind(line) === 'action') continue
      const speechText = lineSpeechText(line)
      if (!speechText) continue
      if (!force && line.audioUrl && !speechTextDiffersFromLineText(line)) {
        skipped++
        continue
      }

      if (force) {
        const sections = dialog.sections.map((sec) => ({
          ...sec,
          lines: sec.lines.map((l) =>
            l.id === line.id ? { ...l, audioUrl: undefined } : l,
          ),
        }))
        const cleared = await updateDialog(dialogId, userId, { sections })
        if (cleared) dialog = cleared
      }

      const speakerIdx = speakers.get(line.speaker) ?? 0
      const voice = getSpeakerVoice(dialog, line.speaker)
      const delivery = ttsDeliveryForSpeaker(dialog, line.speaker)
      const tts = await synthesizeSpeech({
        text: speechText,
        languageCode: dialog.targetLanguage,
        rate: TTS_STORAGE_SPEAKING_RATE,
        gender: voice.gender,
        speakerIndex: speakerIdx,
        voiceName: voice.voiceName,
        voicePrompt: voice.voicePrompt || delivery.stylePrompt,
        pitch: delivery.pitch,
      })
      const audioUrl = await uploadLineAudio(tts.audioBase64, dialogId, line.id)
      generated++

      const sections = dialog.sections.map((sec) => ({
        ...sec,
        lines: sec.lines.map((l) => (l.id === line.id ? { ...l, audioUrl } : l)),
      }))
      const updated = await updateDialog(dialogId, userId, { sections })
      if (updated) dialog = updated
    }
  }

  return { dialog, generated, skipped }
}

/** Ersetzt Audio nur für einen Sprecher (z. B. nach Stimm-/Geschlechtsänderung). */
export async function regenerateSpeakerAudio(
  dialogId: string,
  userId: string,
  speaker: string,
): Promise<{ dialog: Dialog; generated: number }> {
  let dialog = await getDialog(dialogId, userId)
  if (!dialog) throw new Error('Dialog nicht gefunden.')

  dialog = await ensureSpeakerVoicesOnDialog(dialogId, userId, dialog)
  const speakers = speakerIndexMap(dialog)
  const speakerIdx = speakers.get(speaker) ?? 0
  const voice = getSpeakerVoice(dialog, speaker)
  const delivery = ttsDeliveryForSpeaker(dialog, speaker)

  let generated = 0
  for (const section of dialog.sections) {
    for (const line of section.lines) {
      if (line.speaker !== speaker) continue
      if (inferDialogLineKind(line) === 'action') continue
      const speechText = lineSpeechText(line)
      if (!speechText) continue

      const tts = await synthesizeSpeech({
        text: speechText,
        languageCode: dialog.targetLanguage,
        rate: TTS_STORAGE_SPEAKING_RATE,
        gender: voice.gender,
        speakerIndex: speakerIdx,
        voiceName: voice.voiceName,
        voicePrompt: voice.voicePrompt || delivery.stylePrompt,
        pitch: delivery.pitch,
      })
      const audioUrl = await uploadLineAudio(tts.audioBase64, dialogId, line.id)
      generated++

      const sections = dialog.sections.map((sec) => ({
        ...sec,
        lines: sec.lines.map((l) => (l.id === line.id ? { ...l, audioUrl } : l)),
      }))
      const updated = await updateDialog(dialogId, userId, { sections })
      if (updated) dialog = updated
    }
  }

  return { dialog, generated }
}
