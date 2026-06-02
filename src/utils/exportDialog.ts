import type { Dialog } from '../types'
import { lineSpeechText } from '../../shared/line-speech'
import { languageName } from '../types'

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function safeFilename(title: string): string {
  return title.replace(/[^\w\-äöüÄÖÜß]+/g, '_').slice(0, 60) || 'dialog'
}

export function exportDialogJson(dialog: Dialog) {
  const json = JSON.stringify(dialog, null, 2)
  triggerDownload(
    new Blob([json], { type: 'application/json;charset=utf-8' }),
    `${safeFilename(dialog.title)}.json`,
  )
}

export function exportDialogText(dialog: Dialog) {
  const lines: string[] = [
    dialog.title,
    `${languageName(dialog.sourceLanguage)} → ${languageName(dialog.targetLanguage)}`,
    '',
  ]

  for (const section of dialog.sections) {
    lines.push(`=== ${section.title} ===`, '')
    for (const line of section.lines) {
      lines.push(`${line.speaker}:`)
      lines.push(`  ${lineSpeechText(line)}`)
      if (line.birkenbihl?.length) {
        const de = line.birkenbihl.map((w) => w.translation).join(' ')
        lines.push(`  (${de})`)
      } else if (line.text.trim() && lineSpeechText(line) !== line.text.trim()) {
        lines.push(`  (${line.text.trim()})`)
      }
      lines.push('')
    }
  }

  if (dialog.visualScript?.beats?.length) {
    lines.push('--- Bilderskript ---', '')
    for (const beat of dialog.visualScript.beats) {
      lines.push(
        `[${beat.activeSpeaker} → ${beat.addressee}] Zeilen ${beat.lineIndices.map((i) => i + 1).join(', ')}: ${beat.reason ?? beat.expressionEn}`,
      )
    }
  }

  triggerDownload(
    new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }),
    `${safeFilename(dialog.title)}.txt`,
  )
}
