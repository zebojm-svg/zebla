import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
// @ts-expect-error lamejs has no types
import lamejs from 'lamejs'
import { api } from '../api/client'
import type { Dialog, DialogLine } from '../types'
import { isRtlLanguage } from '../types'
import {
  buildSpeakerSideMap,
  collectSpeakersInOrder,
  drawKenBurnsImage,
  KEN_BURNS_EXPORT_FRAMES,
  speakerSideFor,
  type SpeakerSide,
} from '../lib/kenBurns'

const FPS = 30
const GAP_SEC = 0.4

/** AVC Level 3.0 erlaubt max. 414720 Pixel – 1280×720 braucht Level 3.1+. */
const VIDEO_PRESETS = [
  { width: 1280, height: 720, codec: 'avc1.4D401F' },
  { width: 854, height: 480, codec: 'avc1.42E01E' },
  { width: 640, height: 360, codec: 'avc1.42E01E' },
] as const

async function resolveVideoPreset(): Promise<{
  width: number
  height: number
  codec: string
}> {
  for (const preset of VIDEO_PRESETS) {
    const check = await VideoEncoder.isConfigSupported({
      codec: preset.codec,
      width: preset.width,
      height: preset.height,
      bitrate: 2_000_000,
      framerate: FPS,
    })
    if (check.supported) return preset
  }
  throw new Error('Video-Encoder wird von diesem Browser nicht unterstützt.')
}

export interface ExportSlide {
  lineId: string
  speaker: string
  speakerSide: SpeakerSide
  line: DialogLine
  imageUrl: string | null
  sectionTitle: string
  durationSec: number
}

export interface ExportOptions {
  rate: number
  showRomanization: boolean
  targetLanguage: string
  nativeLanguage: string
  onProgress?: (message: string) => void
}

function safeFilename(name: string): string {
  return name.replace(/[^\wäöüÄÖÜß\- ]+/g, '').trim() || 'dialog'
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function buildExportSlides(dialog: Dialog): ExportSlide[] {
  const sideMap = buildSpeakerSideMap(collectSpeakersInOrder(dialog))
  const slides: ExportSlide[] = []
  for (const section of dialog.sections) {
    const sectionImage = section.imageUrl ?? null
    for (const line of section.lines) {
      if (!line.text.trim()) continue
      slides.push({
        lineId: line.id,
        speaker: line.speaker,
        speakerSide: speakerSideFor(sideMap, line.speaker),
        line,
        imageUrl: line.imageUrl ?? sectionImage,
        sectionTitle: section.title,
        durationSec: 0,
      })
    }
  }
  return slides
}

export function validateDialogExport(dialog: Dialog): string | null {
  const slides = buildExportSlides(dialog)
  if (slides.length === 0) return 'Keine Dialogzeilen zum Exportieren.'
  const missing = slides.filter((s) => !s.line.audioUrl)
  if (missing.length > 0) {
    return `${missing.length} Zeile${missing.length !== 1 ? 'n' : ''} ohne Audio. Zuerst „Audio vorbereiten“ (Cloud-Sprachausgabe).`
  }
  return null
}

async function renderAtRate(
  buffer: AudioBuffer,
  rate: number,
): Promise<AudioBuffer> {
  const clamped = Math.min(1.3, Math.max(0.4, rate))
  const offline = new OfflineAudioContext(
    1,
    Math.max(1, Math.ceil((buffer.duration / clamped) * buffer.sampleRate)),
    buffer.sampleRate,
  )
  const src = offline.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = clamped
  src.connect(offline.destination)
  src.start(0)
  return offline.startRendering()
}

function averageChannels(buffer: AudioBuffer): Float32Array {
  const len = buffer.length
  const out = new Float32Array(len)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < len; i++) out[i] += data[i] / buffer.numberOfChannels
  }
  return out
}

export async function buildCombinedAudio(
  dialogId: string,
  slides: ExportSlide[],
  rate: number,
  onProgress?: (message: string) => void,
): Promise<AudioBuffer> {
  const ctx = new AudioContext()
  try {
    const parts: AudioBuffer[] = []
    for (let i = 0; i < slides.length; i++) {
      onProgress?.(`Audio ${i + 1}/${slides.length} …`)
      const blob = await api.tts.lineAudio(dialogId, slides[i].lineId)
      const raw = await ctx.decodeAudioData(await blob.arrayBuffer())
      const atRate = await renderAtRate(raw, rate)
      parts.push(atRate)
      slides[i].durationSec = atRate.duration
    }

    const gapSamples = Math.floor(GAP_SEC * ctx.sampleRate)
    const totalLength =
      parts.reduce((sum, b) => sum + b.length, 0) + gapSamples * Math.max(0, parts.length - 1)
    const combined = ctx.createBuffer(1, totalLength, ctx.sampleRate)
    const channel = combined.getChannelData(0)
    let offset = 0
    for (let i = 0; i < parts.length; i++) {
      channel.set(averageChannels(parts[i]), offset)
      offset += parts[i].length
      if (i < parts.length - 1) offset += gapSamples
    }
    return combined
  } finally {
    await ctx.close()
  }
}

function audioBufferToMp3(buffer: AudioBuffer): Blob {
  const ch = buffer.getChannelData(0)
  const int16 = new Int16Array(ch.length)
  for (let i = 0; i < ch.length; i++) {
    const s = Math.max(-1, Math.min(1, ch[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  const encoder = new lamejs.Mp3Encoder(1, buffer.sampleRate, 128)
  const block = 1152
  const chunks: Int8Array[] = []
  for (let i = 0; i < int16.length; i += block) {
    const slice = int16.subarray(i, i + block)
    const buf = encoder.encodeBuffer(slice)
    if (buf.length > 0) chunks.push(buf)
  }
  const end = encoder.flush()
  if (end.length > 0) chunks.push(end)
  return new Blob(chunks as BlobPart[], { type: 'audio/mpeg' })
}

/** Bilder über die API laden (Firebase-Storage blockiert Canvas-CORS im Browser). */
async function loadSlideBitmap(
  dialogId: string,
  slide: ExportSlide,
): Promise<ImageBitmap | null> {
  if (!slide.imageUrl) return null
  try {
    const blob = await api.tts.lineImage(dialogId, slide.lineId)
    return createImageBitmap(blob)
  } catch {
    return null
  }
}

function drawSlide(
  ctx: CanvasRenderingContext2D,
  slide: ExportSlide,
  bitmap: ImageBitmap | null,
  options: ExportOptions,
  width: number,
  height: number,
  kenBurnsProgress = 0,
) {
  const targetRtl = isRtlLanguage(options.targetLanguage)
  const scale = height / 720

  ctx.fillStyle = '#020617'
  ctx.fillRect(0, 0, width, height)

  const imgH = Math.floor(height * 0.62)
  if (bitmap) {
    drawKenBurnsImage(
      ctx,
      bitmap,
      0,
      0,
      width,
      imgH,
      slide.speakerSide,
      kenBurnsProgress,
    )
  } else {
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(0, 0, width, imgH)
    ctx.fillStyle = '#64748b'
    ctx.font = `${Math.round(28 * scale)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(slide.sectionTitle, width / 2, imgH / 2)
  }

  const panelY = imgH
  const panelH = height - imgH
  ctx.fillStyle = '#1e293b'
  ctx.fillRect(0, panelY, width, panelH)

  ctx.fillStyle = '#a5b4fc'
  ctx.font = `bold ${Math.round(22 * scale)}px system-ui, sans-serif`
  ctx.textAlign = targetRtl ? 'right' : 'left'
  const pad = Math.round(40 * scale)
  ctx.fillText(slide.speaker, targetRtl ? width - pad : pad, panelY + 36 * scale)

  const line = slide.line
  const words = line.birkenbihl?.length ? line.birkenbihl : null
  const startY = panelY + 70

  if (words) {
    let x = targetRtl ? width - pad : pad
    const maxX = width - pad
    for (const w of words) {
      ctx.textAlign = 'center'
      const wordW = Math.max(48 * scale, w.text.length * 14 * scale)
      if (!targetRtl && x + wordW > maxX) x = pad
      const cx = targetRtl ? x - wordW / 2 : x + wordW / 2

      ctx.fillStyle = '#f1f5f9'
      ctx.font = `${Math.round(22 * scale)}px system-ui, sans-serif`
      ctx.fillText(w.text, cx, startY, wordW)

      let subY = startY + 22 * scale
      if (options.showRomanization && w.romanization) {
        ctx.fillStyle = '#9ca3af'
        ctx.font = `italic ${Math.round(14 * scale)}px system-ui, sans-serif`
        ctx.fillText(w.romanization, cx, subY, wordW)
        subY += 18 * scale
      }
      ctx.fillStyle = '#94a3b8'
      ctx.font = `${Math.round(16 * scale)}px system-ui, sans-serif`
      ctx.fillText(w.translation, cx, subY, wordW)

      x = targetRtl ? x - wordW - 10 * scale : x + wordW + 10 * scale
    }
  } else {
    ctx.fillStyle = '#f1f5f9'
    ctx.font = `${Math.round(26 * scale)}px system-ui, sans-serif`
    ctx.textAlign = targetRtl ? 'right' : 'left'
    const maxW = width - pad * 2
    wrapText(ctx, line.text, targetRtl ? width - pad : pad, startY, maxW, 32 * scale)
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/)
  let line = ''
  let dy = y
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, dy)
      line = word
      dy += lineHeight
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, dy)
}

export async function exportDialogMp3(dialog: Dialog, options: ExportOptions): Promise<void> {
  const err = validateDialogExport(dialog)
  if (err) throw new Error(err)

  const slides = buildExportSlides(dialog)
  options.onProgress?.('Erstelle MP3 …')
  const audio = await buildCombinedAudio(dialog.id, slides, options.rate, options.onProgress)
  const mp3 = audioBufferToMp3(audio)
  triggerDownload(mp3, `${safeFilename(dialog.title)}-${options.rate.toFixed(2)}x.mp3`)
}

function supportsMp4Export(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined'
}

export async function exportDialogMp4(dialog: Dialog, options: ExportOptions): Promise<void> {
  const err = validateDialogExport(dialog)
  if (err) throw new Error(err)
  if (!supportsMp4Export()) {
    throw new Error(
      'MP4-Export braucht Chrome oder Edge (WebCodecs). Bitte diesen Browser verwenden.',
    )
  }

  const slides = buildExportSlides(dialog)
  options.onProgress?.('Lade Bilder …')
  const bitmaps: (ImageBitmap | null)[] = []
  for (let i = 0; i < slides.length; i++) {
    options.onProgress?.(`Bild ${i + 1}/${slides.length} …`)
    bitmaps.push(await loadSlideBitmap(dialog.id, slides[i]))
  }

  options.onProgress?.('Bereite Audio vor …')
  const audioBuffer = await buildCombinedAudio(dialog.id, slides, options.rate, options.onProgress)

  const videoPreset = await resolveVideoPreset()
  const { width: vidW, height: vidH, codec: vidCodec } = videoPreset

  const canvas = document.createElement('canvas')
  canvas.width = vidW
  canvas.height = vidH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas nicht verfügbar.')

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: vidW, height: vidH },
    audio: { codec: 'aac', sampleRate: audioBuffer.sampleRate, numberOfChannels: 1 },
    fastStart: 'in-memory',
  })

  let videoEncoder: VideoEncoder
  let audioEncoder: AudioEncoder

  videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      throw e
    },
  })
  videoEncoder.configure({
    codec: vidCodec,
    width: vidW,
    height: vidH,
    bitrate: 2_500_000,
    framerate: FPS,
  })

  audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => {
      throw e
    },
  })
  audioEncoder.configure({
    codec: 'mp4a.40.2',
    sampleRate: audioBuffer.sampleRate,
    numberOfChannels: 1,
    bitrate: 128_000,
  })

  const channel = audioBuffer.getChannelData(0)
  const chunkFrames = Math.min(channel.length, 480_000)
  let audioTimestamp = 0
  for (let offset = 0; offset < channel.length; offset += chunkFrames) {
    const frames = Math.min(chunkFrames, channel.length - offset)
    const slice = channel.subarray(offset, offset + frames)
    const audioData = new AudioData({
      format: 'f32',
      sampleRate: audioBuffer.sampleRate,
      numberOfFrames: frames,
      numberOfChannels: 1,
      timestamp: audioTimestamp,
      data: slice,
    })
    audioEncoder.encode(audioData)
    audioData.close()
    audioTimestamp += Math.round((frames / audioBuffer.sampleRate) * 1_000_000)
  }

  let timestampUs = 0
  const totalSlides = slides.length
  const totalSec = slides.reduce((s, sl) => s + sl.durationSec, 0) + GAP_SEC * Math.max(0, slides.length - 1)
  options.onProgress?.(
    `Video: ${totalSlides} Szenen (ca. ${Math.ceil(totalSec)} s) — bitte kurz warten …`,
  )

  /** Ein Frame pro Szene mit voller Dauer (statt 30/s) → Export in Sekunden statt Minuten. */
  const pushFrame = (durationSec: number, keyFrame: boolean) => {
    const durationUs = Math.max(1, Math.round(durationSec * 1_000_000))
    const frame = new VideoFrame(canvas, { timestamp: timestampUs, duration: durationUs })
    videoEncoder.encode(frame, { keyFrame })
    frame.close()
    timestampUs += durationUs
  }

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]
    const bmp = bitmaps[i]
    options.onProgress?.(`Video: Szene ${i + 1}/${totalSlides} …`)

    const frameCount = Math.max(2, KEN_BURNS_EXPORT_FRAMES)
    const frameDur = slide.durationSec / frameCount
    for (let f = 0; f < frameCount; f++) {
      const progress = frameCount > 1 ? f / (frameCount - 1) : 0
      drawSlide(ctx, slide, bmp, options, vidW, vidH, progress)
      pushFrame(frameDur, f === 0)
    }

    if (i < slides.length - 1) {
      drawSlide(ctx, slide, bmp, options, vidW, vidH, 1)
      pushFrame(GAP_SEC, false)
    }
    await new Promise((r) => setTimeout(r, 0))
  }

  options.onProgress?.('Finalisiere MP4 (fast fertig) …')
  await videoEncoder.flush()
  await audioEncoder.flush()
  videoEncoder.close()
  audioEncoder.close()
  muxer.finalize()

  const buffer = (muxer.target as ArrayBufferTarget).buffer
  triggerDownload(
    new Blob([buffer], { type: 'video/mp4' }),
    `${safeFilename(dialog.title)}-${options.rate.toFixed(2)}x.mp4`,
  )

  bitmaps.forEach((b) => b?.close())
}
