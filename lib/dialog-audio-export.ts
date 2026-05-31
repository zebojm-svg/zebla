import JSZip from 'jszip'
import { getDialog } from './firestore.js'
import { downloadLineAudio } from './audio-storage.js'
import type { Dialog, DialogLine } from '../shared/types.js'

function orderedLinesWithAudio(dialog: Dialog): DialogLine[] {
  const lines: DialogLine[] = []
  for (const section of dialog.sections) {
    for (const line of section.lines) {
      if (line.audioUrl) lines.push(line)
    }
  }
  return lines
}

export async function exportDialogAudioZip(
  dialogId: string,
  userId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const dialog = await getDialog(dialogId, userId)
  if (!dialog) throw new Error('Dialog nicht gefunden.')

  const lines = orderedLinesWithAudio(dialog)
  if (lines.length === 0) {
    throw new Error('Noch keine Audiodateien vorhanden. Zuerst „Audio vorbereiten“ ausführen.')
  }

  const zip = new JSZip()
  let index = 0
  for (const line of lines) {
    index++
    const num = String(index).padStart(2, '0')
    const speaker = line.speaker.replace(/[^\w\-]+/g, '_').slice(0, 20)
    const mp3 = await downloadLineAudio(dialogId, line.id)
    zip.file(`${num}-${speaker}.mp3`, mp3)
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const safeTitle = dialog.title.replace(/[^\wäöüÄÖÜß\- ]+/g, '').trim() || 'dialog'
  return { buffer, filename: `${safeTitle}-audio.zip` }
}
