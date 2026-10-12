import { recordGeminiResponse } from './ai-usage-ledger.js'
import { assertAiAllowed } from './ai-authorize.js'
/**
 * Fertiges Standbild für eine Storyboard-Zeile.
 * Gemini mit Bibliotheks-Fotos als Lock — kein Blinken, kein Film.
 */

import { randomUUID } from 'crypto'
import { geminiImageModelCandidates, isGeminiImageUnavailable } from './gemini-image-model.js'
import {
  closeupLooksLikeWideCrop,
  cropWideStillToSpeaker,
} from './film-closeup-crop.js'
import { closeupKontextPrompt } from '../shared/film-closeup-space.js'
import {
  buildFilmStillPrompt,
  correctionIsFaceOnly,
  correctionRewritesPerson,
  stillAttachmentInstruction,
  stillReferencePack,
} from '../shared/film-stills.js'
import { editImageWithKontext, fluxLockAvailable } from './story-stills-gen.js'
import type { FilmScene, FilmStoryboard, FilmStoryboardPanel } from '../shared/film-storyboard.js'
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

const CLOSEUP_NOT_CROP_RETRY =
  'RETRY: The previous image was a cropped screenshot of the wide photo. ' +
  'Paint a NEW closer camera with parallax. Face larger. Do not copy, enlarge, or screenshot the attached photo.'

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
  correctingExisting = false,
  closeup = false,
  rewritePerson = false,
  insert = false,
  packInstruction = '',
): Promise<Buffer> {
  const apiKey = requireGeminiKey()
  await assertAiAllowed()
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = []
  if (refs.length) {
    for (const img of refs) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } })
    }
    parts.push({
      text: stillAttachmentInstruction({
        correctingExisting,
        closeup,
        insert,
        rewritePerson,
        packInstruction,
      }),
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
      recordGeminiResponse('still', model, data)
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
  extras: {
    hasLibraryRefs: boolean
    targetLanguage?: string
    correctingExisting?: boolean
    spokenLine?: string
    beatTotal?: number
    speakerGender?: 'male' | 'female'
    speakerX?: number
    continuityEn?: string
  },
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
    hasLibraryRefs: extras.hasLibraryRefs,
    targetLanguage: extras.targetLanguage,
    directorNote: panel.directorNote,
    stillCorrection: panel.stillCorrection,
    correctingExisting: extras.correctingExisting,
    spokenLine: extras.spokenLine,
    beatIndex: panel.panelIndex,
    beatTotal: extras.beatTotal,
    shot: panel.shot,
    closeupSpeaker: panel.closeupSpeaker,
    speakerGender: extras.speakerGender,
    speakerX: extras.speakerX,
    continuityEn: extras.continuityEn,
  })
}

export async function generateFilmPanelStillImage(opts: {
  panel: FilmStoryboardPanel
  scene?: FilmScene
  styleId?: string
  previousStillUrl?: string
  correctFromUrl?: string
  targetLanguage?: string
  beatTotal?: number
  sceneWideStillUrl?: string
  speakerGender?: 'male' | 'female'
  speakerX?: number
  speakerSitting?: boolean
  continuityEn?: string
  board?: FilmStoryboard
}): Promise<string> {
  const pack = stillReferencePack(opts.panel, {
    previousStillUrl: opts.previousStillUrl,
    correctFromUrl: opts.correctFromUrl,
    sceneWideStillUrl: opts.sceneWideStillUrl,
    board: opts.board,
  })
  const refs = await loadRefs(pack.urls)
  const prompt = stillPromptForPanel(opts.panel, opts.scene, opts.styleId, {
    hasLibraryRefs: refs.length > 0,
    targetLanguage: opts.targetLanguage,
    correctingExisting: Boolean(opts.correctFromUrl),
    spokenLine: opts.panel.caption || opts.panel.imageCue,
    beatTotal: opts.beatTotal,
    speakerGender: opts.speakerGender,
    speakerX: opts.speakerX,
    continuityEn: opts.continuityEn,
  })
  const rewritePerson = correctionRewritesPerson(opts.panel.stillCorrection)
  const isCloseup = opts.panel.shot === 'closeup'
  const isInsert = opts.panel.shot === 'insert'
  const faceOnly = correctionIsFaceOnly(opts.panel.stillCorrection)
  if (
    isCloseup &&
    !faceOnly &&
    opts.sceneWideStillUrl &&
    fluxLockAvailable()
  ) {
    try {
      const moved = await editImageWithKontext({
        prompt: closeupKontextPrompt({
          speaker: opts.panel.closeupSpeaker || '',
          speakerX: opts.speakerX,
          settingHint: opts.panel.settingHint,
        }),
        imageUrl: opts.sceneWideStillUrl,
        aspectRatio: '16:9',
      })
      return await uploadPng(moved.buffer, `film-stills/${randomUUID()}.png`)
    } catch {
      /* Gemini nur wenn FLUX die Kamera nicht versetzen konnte */
    }
  }
  let buffer = await generateStillPng(
    prompt,
    refs,
    Boolean(opts.correctFromUrl),
    isCloseup,
    rewritePerson,
    isInsert,
    pack.instruction,
  )
  const shouldCatchCrop =
    isCloseup && Boolean(opts.sceneWideStillUrl) && !faceOnly
  if (shouldCatchCrop && opts.sceneWideStillUrl) {
    const wide = await fetchImageAsInline(opts.sceneWideStillUrl)
    if (wide) {
      try {
        const crop = await cropWideStillToSpeaker(
          Buffer.from(wide.data, 'base64'),
          opts.speakerX ?? 50,
          opts.speakerSitting !== false,
        )
        if (await closeupLooksLikeWideCrop(buffer, crop)) {
          buffer = await generateStillPng(
            `${prompt}\n${CLOSEUP_NOT_CROP_RETRY}`,
            refs,
            Boolean(opts.correctFromUrl),
            true,
            rewritePerson,
            false,
            pack.instruction,
          )
        }
      } catch {
        /* Vergleich fehlgeschlagen: das gemalte Bild trotzdem behalten */
      }
    }
  }
  return await uploadPng(buffer, `film-stills/${randomUUID()}.png`)
}
