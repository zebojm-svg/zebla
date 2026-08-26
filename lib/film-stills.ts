/**
 * Fertiges Standbild für eine Storyboard-Zeile.
 * Gemini mit Bibliotheks-Fotos als Lock — kein Blinken, kein Film.
 */

import { randomUUID } from 'crypto'
import { geminiImageModelCandidates, isGeminiImageUnavailable } from './gemini-image-model.js'
import {
  buildFilmStillPrompt,
  referenceUrlsForPanel,
} from '../shared/film-stills.js'
import type { FilmScene, FilmStoryboardPanel } from '../shared/film-storyboard.js'
import type { StoryArtStyleId } from '../shared/story-art-styles.js'

function requireGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY ist nicht gesetzt.')
  return key
}

type GeminiImageResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }
  }>
  error?: { message?: string }
}

type InlineImage = { mimeType: string; data: string }

async function fetchImageAsInline(url: string): Promise<InlineImage | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 32) return null
    const mimeType = res.headers.get('content-type')?.split(';')[0] || 'image/png'
    return { mimeType, data: buf.toString('base64') }
  } catch {
    return null
  }
}

async function loadRefs(urls: string[]): Promise<InlineImage[]> {
  const out: InlineImage[] = []
  for (const url of urls) {
    const img = await fetchImageAsInline(url)
    if (img) out.push(img)
  }
  return out
}

async function uploadPng(buffer: Buffer, path: string): Promise<string> {
  const { adminStorage } = await import('./firebase-admin.js')
  const bucket = adminStorage().bucket()
  const file = bucket.file(path)
  await file.save(buffer, {
    metadata: { contentType: 'image/png', cacheControl: 'public, max-age=86400' },
  })
  await file.makePublic()
  return `https://storage.googleapis.com/${bucket.name}/${path}`
}

async function generateStillPng(
  prompt: string,
  refs: InlineImage[],
): Promise<Buffer> {
  const apiKey = requireGeminiKey()
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = []
  if (refs.length) {
    for (const img of refs) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } })
    }
    parts.push({
      text:
        'Attached photos: keep these EXACT people (face, hair, clothes). ' +
        'If a photo is a place, keep that location. Compose one finished still of the action.',
    })
  }
  parts.push({ text: prompt })

  let lastError = 'Standbild fehlgeschlagen.'
  for (const model of geminiImageModelCandidates()) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 90_000)
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig: { aspectRatio: '16:9' },
            },
          }),
          signal: controller.signal,
        },
      )
      clearTimeout(timer)
      const data = (await res.json()) as GeminiImageResponse
      if (data.error?.message) throw new Error(data.error.message)
      const img = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData
      if (!img?.data) throw new Error('Kein Standbild erhalten.')
      return Buffer.from(img.data, 'base64')
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError
      if (err instanceof Error && err.name === 'AbortError') {
        lastError = 'Das Standbild hat zu lange gedauert. Bitte noch einmal versuchen.'
      }
      if (isGeminiImageUnavailable(lastError)) continue
      throw new Error(lastError)
    }
  }
  throw new Error(lastError)
}

export function stillPromptForPanel(
  panel: FilmStoryboardPanel,
  scene: FilmScene | undefined,
  styleId: StoryArtStyleId | string | undefined,
  hasLibraryRefs: boolean,
): string {
  return buildFilmStillPrompt({
    caption: panel.caption,
    imageCue: panel.imageCue,
    settingHint: panel.settingHint,
    expressionHint: panel.expressionHint,
    sceneTitle: scene?.title,
    styleId,
    names: panel.placements.map((p) => p.name),
    poseHints: panel.placements.map((p) => `${p.name}: ${p.poseHint}`),
    hasLibraryRefs,
  })
}

export async function generateFilmPanelStillImage(opts: {
  panel: FilmStoryboardPanel
  scene?: FilmScene
  styleId?: string
  previousStillUrl?: string
}): Promise<string> {
  const urls = referenceUrlsForPanel(opts.panel, opts.previousStillUrl)
  const refs = await loadRefs(urls)
  const prompt = stillPromptForPanel(opts.panel, opts.scene, opts.styleId, refs.length > 0)
  const buffer = await generateStillPng(prompt, refs)
  return await uploadPng(buffer, `film-stills/${randomUUID()}.png`)
}
