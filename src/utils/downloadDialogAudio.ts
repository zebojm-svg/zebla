import { api } from '../api/client'
import type { Dialog } from '../types'

function safeFilename(name: string): string {
  return name.replace(/[^\wäöüÄÖÜß\- ]+/g, '').trim() || 'dialog'
}

function linesWithAudio(dialog: Dialog) {
  const lines: { id: string }[] = []
  for (const section of dialog.sections) {
    for (const line of section.lines) {
      if (line.audioUrl) lines.push(line)
    }
  }
  return lines
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** ZIP über die API (kein CORS-Problem mit Firebase Storage). */
export async function downloadDialogAudioZip(dialog: Dialog): Promise<void> {
  if (linesWithAudio(dialog).length === 0) {
    throw new Error('Noch keine Audiodateien vorhanden. Zuerst „Audio vorbereiten“ ausführen.')
  }
  const blob = await api.tts.exportZip(dialog.id)
  triggerDownload(blob, `${safeFilename(dialog.title)}-audio.zip`)
}

/** Eine zusammenhängende WAV – Zeilen-Audios über die API laden. */
export async function downloadDialogAudioCombined(dialog: Dialog): Promise<void> {
  const lines = linesWithAudio(dialog)
  if (lines.length === 0) {
    throw new Error('Noch keine Audiodateien vorhanden. Zuerst „Audio vorbereiten“ ausführen.')
  }

  const audioContext = new AudioContext()
  const buffers: AudioBuffer[] = []
  try {
    for (const line of lines) {
      const blob = await api.tts.lineAudio(dialog.id, line.id)
      const arrayBuffer = await blob.arrayBuffer()
      buffers.push(await audioContext.decodeAudioData(arrayBuffer))
    }

    const gapSec = 0.4
    const gapSamples = Math.floor(audioContext.sampleRate * gapSec)
    const totalLength =
      buffers.reduce((sum, b) => sum + b.length, 0) +
      gapSamples * Math.max(0, buffers.length - 1)
    const combined = audioContext.createBuffer(1, totalLength, audioContext.sampleRate)
    const channel = combined.getChannelData(0)
    let offset = 0
    for (let i = 0; i < buffers.length; i++) {
      const buf = buffers[i]
      const mono = buf.numberOfChannels > 1 ? averageChannels(buf) : buf.getChannelData(0)
      channel.set(mono, offset)
      offset += buf.length
      if (i < buffers.length - 1) offset += gapSamples
    }

    triggerDownload(audioBufferToWav(combined), `${safeFilename(dialog.title)}-gesamt.wav`)
  } finally {
    await audioContext.close()
  }
}

function averageChannels(buffer: AudioBuffer): Float32Array {
  const len = buffer.length
  const out = new Float32Array(len)
  const chCount = buffer.numberOfChannels
  for (let c = 0; c < chCount; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < len; i++) out[i] += data[i] / chCount
  }
  return out
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = 1
  const sampleRate = buffer.sampleRate
  const format = 1
  const bitDepth = 16
  const data = buffer.getChannelData(0)
  const samples = new Int16Array(data.length)
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]))
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  const byteRate = (sampleRate * numChannels * bitDepth) / 8
  const blockAlign = (numChannels * bitDepth) / 8
  const bufferLength = 44 + samples.length * 2
  const arrayBuffer = new ArrayBuffer(bufferLength)
  const view = new DataView(arrayBuffer)
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, format, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeString(view, 36, 'data')
  view.setUint32(40, samples.length * 2, true)
  let o = 44
  for (let i = 0; i < samples.length; i++, o += 2) {
    view.setInt16(o, samples[i], true)
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
}
