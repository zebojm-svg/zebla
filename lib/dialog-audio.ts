import type { Dialog, DialogLine, DialogSection } from '../shared/types.js'
import { lineSpeechText, speechTextDiffersFromLineText } from '../shared/line-speech.js'
import { getDialog, updateDialog } from './firestore.js'
import { uploadLineAudio } from './audio-storage.js'
import { synthesizeSpeech } from './tts.js'
import { resolveSpeakerGender } from './speaker-voice.js'

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
      if (!map.has(line.speaker)) {
        map.set(line.speaker, idx++)
      }
    }
  }
  return map
}

export async function getOrCreateLineAudio(
  dialogId: string,
  userId: string,
  lineId: string,
  rate: number,
): Promise<{ audioUrl: string; cached: boolean; dialog: Dialog }> {
  const dialog = await getDialog(dialogId, userId)
  if (!dialog) throw new Error('Dialog nicht gefunden.')

  const found = findLineInDialog(dialog, lineId)
  if (!found) throw new Error('Zeile nicht gefunden.')

  if (found.line.audioUrl && !speechTextDiffersFromLineText(found.line)) {
    return { audioUrl: found.line.audioUrl, cached: true, dialog }
  }

  const speakers = speakerIndexMap(dialog)
  const speakerIdx = speakers.get(found.line.speaker) ?? 0
  const gender = resolveSpeakerGender(
    found.line.speaker,
    speakerIdx,
    dialog.characterBible,
  )

  const tts = await synthesizeSpeech({
    text: lineSpeechText(found.line),
    languageCode: dialog.targetLanguage,
    rate,
    gender,
    speakerIndex: speakerIdx,
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

  const speakers = speakerIndexMap(dialog)
  let generated = 0
  let skipped = 0

  for (const section of dialog.sections) {
    for (const line of section.lines) {
      const speechText = lineSpeechText(line)
      if (!speechText) continue
      if (!force && line.audioUrl && !speechTextDiffersFromLineText(line)) {
        skipped++
        continue
      }

      const speakerIdx = speakers.get(line.speaker) ?? 0
      const gender = resolveSpeakerGender(
        line.speaker,
        speakerIdx,
        dialog.characterBible,
      )
      const tts = await synthesizeSpeech({
        text: speechText,
        languageCode: dialog.targetLanguage,
        rate,
        gender,
        speakerIndex: speakerIdx,
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
