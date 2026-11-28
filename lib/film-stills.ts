import { recordGeminiResponse } from './ai-usage-ledger.js'
import { assertAiAllowed } from './ai-authorize.js'
/**
 * Fertiges Standbild für eine Storyboard-Zeile.
 * Gemini mit Bibliotheks-Fotos als Lock — kein Blinken, kein Film.
 */

import { randomUUID } from 'crypto'
import { fetchImageBuffer, grayThumb } from './film-image-parts.js'
import { nearCopy } from '../shared/film-regie-judge.js'
import { geminiImageModelCandidates, isGeminiImageUnavailable } from './gemini-image-model.js'
import {
  closeupLooksLikeWideCrop,
  cropWideStillToSpeaker,
} from './film-closeup-crop.js'
import { closeupKontextPrompt } from '../shared/film-closeup-space.js'
import {
  parseStillPackRefs,
  stillEditImageErrorDe,
  stillPackNumber,
  stillUrlForPackRef,
  STILL_EDIT_FLUX_MISSING_DE,
  STILL_EDIT_IMAGE_TIMEOUT_DE,
} from '../shared/film-still-pack.js'
import {
  buildFilmStillPrompt,
  filmStillLanguageEn,
  correctionIsFaceOnly,
  isVideoCallSituation,
  correctionRewritesPerson,
  stillAttachmentInstruction,
  stillEditKontextPrompt,
  STILL_EDIT_FLUX_MODEL,
  stillReferencePack,
  type StillPackLibraryAsset,
} from '../shared/film-stills.js'
import { editImageWithKontext, fluxLockAvailable } from './story-stills-gen.js'
import type { FilmScene, FilmStoryboard, FilmStoryboardPanel } from '../shared/film-storyboard.js'
import type { FilmInventory } from '../shared/types.js'
import { getStoryArtStyle, getStoryStylePrompt, type StoryArtStyleId } from '../shared/story-art-styles.js'
import type { FilmContinuity } from '../shared/film-continuity.js'
import {
  regieAttachmentLegendEn,
  regiePaintPromptEn,
  type FilmRegiePlan,
  type FilmRegiePlanRef,
} from '../shared/film-regie-plan.js'

function requireGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY ist nicht gesetzt.')
  return key
}

type GeminiImageResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }
  }>
  promptFeedback?: { blockReason?: string }
  error?: { message?: string; code?: number; status?: string }
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
  const loaded = await Promise.all(urls.map((url) => fetchImageAsInline(url)))
  return loaded.filter((img): img is InlineImage => img !== null)
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
  directorHint = false,
): Promise<Buffer> {
  const parts: ImagePart[] = []
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
        directorHint,
      }),
    })
  }
  parts.push({ text: prompt })
  return paintWithGemini(parts)
}

type ImagePart = { text?: string; inlineData?: { mimeType: string; data: string } }

async function paintWithGemini(parts: ImagePart[]): Promise<Buffer> {
  const apiKey = requireGeminiKey()
  await assertAiAllowed()
  let lastError = 'Standbild fehlgeschlagen.'
  for (const model of geminiImageModelCandidates()) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 90_000)
      let res: Response
      try {
        res = await fetch(
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
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error(STILL_EDIT_IMAGE_TIMEOUT_DE)
        }
        throw err
      } finally {
        clearTimeout(timer)
      }
      const bodyText = await res.text()
      let data: GeminiImageResponse = {}
      if (!bodyText.trim()) {
        throw new Error(`[${res.status}] Kein Standbild erhalten.`)
      }
      try {
        data = JSON.parse(bodyText) as GeminiImageResponse
      } catch {
        throw new Error(`[${res.status}] Kein Standbild erhalten.`)
      }
      recordGeminiResponse('still', model, data)
      const status = Number(data.error?.code) || res.status
      if (data.error?.message || !res.ok) {
        const dump = data.error?.message || bodyText.slice(0, 180)
        throw new Error(`[${status}] ${dump}`)
      }
      if (data.promptFeedback?.blockReason) {
        throw new Error(`[${status}] Kein Standbild erhalten.`)
      }
      const img = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData
      if (!img?.data) throw new Error(`[${status}] Kein Standbild erhalten.`)
      return Buffer.from(img.data, 'base64')
    } catch (err) {
      lastError = stillEditImageErrorDe(err)
      if (isGeminiImageUnavailable(err instanceof Error ? err.message : lastError)) continue
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
    situationText?: string
    continuityBriefEn?: string
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
    situationText: extras.situationText,
    continuityBriefEn: extras.continuityBriefEn,
  })
}

/** Replicate bremst bei wenig Guthaben: einmal so lange warten, dann noch einmal — nicht öfter. */
const FLUX_THROTTLE_WAIT_MS = 10_000
const FLUX_EDIT_MAX_ATTEMPTS = 2

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
  situationText?: string
  continuityBriefEn?: string
  directorRefs?: Array<{ url: string; name: string; role?: 'grundbild' | 'identity' }>
  board?: FilmStoryboard
  inventory?: FilmInventory | null
  library?: StillPackLibraryAsset[]
}): Promise<string> {
  const hint = opts.panel.stillCorrection?.trim()
  const currentUrl = opts.panel.stillUrl?.trim()
  const fluxInput = hint
    ? stillUrlForPackRef(opts.board, hint, currentUrl)
    : undefined
  if (hint && fluxInput) {
    if (!fluxLockAvailable()) {
      throw new Error(STILL_EDIT_FLUX_MISSING_DE)
    }
    const edit = () => {
      const refs = parseStillPackRefs(hint)
      return editImageWithKontext({
        prompt: stillEditKontextPrompt(hint, {
          packNumber: opts.board
            ? stillPackNumber(opts.board, opts.panel)
            : opts.panel.panelIndex,
          sourcePackNumber: refs[0],
          speaker:
            opts.panel.closeupSpeaker ||
            (opts.panel.shot === 'insert' ? undefined : opts.panel.placements[0]?.name),
          spokenDe: opts.panel.caption,
          handlung: opts.panel.imageCue || opts.panel.caption,
          regie: opts.panel.directorNote,
        }),
        imageUrl: fluxInput,
        aspectRatio: '16:9',
        model: STILL_EDIT_FLUX_MODEL,
      })
    }
    try {
      let moved: Awaited<ReturnType<typeof editImageWithKontext>>
      let lastErr: unknown
      for (let attempt = 0; attempt < FLUX_EDIT_MAX_ATTEMPTS; attempt++) {
        try {
          moved = await edit()
          lastErr = undefined
          break
        } catch (err) {
          lastErr = err
          const raw = err instanceof Error ? err.message : String(err ?? '')
          if (attempt + 1 >= FLUX_EDIT_MAX_ATTEMPTS || !/throttl|rate.?limit|too many requests/i.test(raw)) {
            throw err
          }
          await new Promise((resolve) => setTimeout(resolve, FLUX_THROTTLE_WAIT_MS))
        }
      }
      if (lastErr) throw lastErr
      return await uploadPng(moved!.buffer, `film-stills/${randomUUID()}.png`)
    } catch (err) {
      console.error('[bild-aendern] FLUX', err instanceof Error ? err.message : err)
      throw new Error(stillEditImageErrorDe(err))
    }
  }
  const pack = stillReferencePack(opts.panel, {
    previousStillUrl: opts.previousStillUrl,
    correctFromUrl: opts.correctFromUrl,
    sceneWideStillUrl: opts.sceneWideStillUrl,
    board: opts.board,
    inventory: opts.inventory,
    library: opts.library,
    directorRefs: opts.directorRefs,
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
    situationText: opts.situationText,
    continuityBriefEn: opts.continuityBriefEn,
  })
  const rewritePerson = correctionRewritesPerson(opts.panel.stillCorrection)
  const isCloseup = opts.panel.shot === 'closeup'
  const isInsert = opts.panel.shot === 'insert'
  const faceOnly = correctionIsFaceOnly(opts.panel.stillCorrection)
  const videoCall = isVideoCallSituation(opts.continuityBriefEn, opts.situationText)
  if (
    isCloseup &&
    !videoCall &&
    !faceOnly &&
    !opts.panel.stillCorrection?.trim() &&
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
  const directorHint = Boolean(opts.panel.stillCorrection?.trim()) && !rewritePerson
  let buffer = await generateStillPng(
    prompt,
    refs,
    Boolean(opts.correctFromUrl),
    isCloseup,
    rewritePerson,
    isInsert,
    pack.instruction,
    directorHint,
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
            directorHint,
          )
        }
      } catch {
        /* Vergleich fehlgeschlagen: das gemalte Bild trotzdem behalten */
      }
    }
  }
  return await uploadPng(buffer, `film-stills/${randomUUID()}.png`)
}

/** Die Regie hat das Bild geplant: genau ihre Vorlagen mit ihren Sätzen, ihr Auftrag, sonst nichts. */
export async function paintRegiePlannedStill(opts: {
  plan: FilmRegiePlan
  continuity?: FilmContinuity
  styleId?: string
  targetLanguage?: string
  fixEn?: string
  /** Frühere Bilder, denen das neue nicht fast gleichen darf (voriges Bild, mitgeschickte frühere Bilder). */
  compareUrls?: string[]
  /** Raumbild des Kamera-Ortes (steht auch in plan.refs). */
  roomPlateUrl?: string
}): Promise<{ url: string; copyOf?: string }> {
  const loaded = await Promise.all(
    opts.plan.refs.map(async (ref) => ({ ref, image: await fetchImageAsInline(ref.url) })),
  )
  const refs = loaded.filter((item): item is { ref: FilmRegiePlanRef; image: InlineImage } => item.image !== null)
  const parts: ImagePart[] = refs.map((item) => ({ inlineData: item.image }))
  const legend = regieAttachmentLegendEn(refs.map((item) => item.ref))
  if (legend) parts.push({ text: legend })
  parts.push({
    text: regiePaintPromptEn({
      plan: opts.plan,
      continuity: opts.continuity,
      styleLabel: getStoryArtStyle(opts.styleId).label,
      stylePrompt: getStoryStylePrompt(opts.styleId),
      languageEn: filmStillLanguageEn(opts.targetLanguage),
      fixEn: opts.fixEn,
      roomPlateAttached: Boolean(opts.roomPlateUrl && refs.some((item) => item.ref.url === opts.roomPlateUrl)),
    }),
  })
  const buffer = await paintWithGemini(parts)
  const url = await uploadPng(buffer, `film-stills/${randomUUID()}.png`)
  const copyOf = await nearCopyOf(buffer, opts.compareUrls ?? [], refs)
  return copyOf ? { url, copyOf } : { url }
}

/** Ist das neue Bild fast eine Kopie eines dieser früheren Bilder? Schon geladene Vorlagen werden nicht noch einmal geholt. */
async function nearCopyOf(
  buffer: Buffer,
  urls: string[],
  loaded: Array<{ ref: FilmRegiePlanRef; image: InlineImage }>,
): Promise<string | undefined> {
  const wanted = [...new Set(urls.filter((url) => url.startsWith('http')))].slice(0, 4)
  if (!wanted.length) return undefined
  const mine = await grayThumb(buffer)
  if (!mine) return undefined
  const thumbs = await Promise.all(
    wanted.map(async (url) => {
      const have = loaded.find((item) => item.ref.url === url)?.image
      const data = have ? Buffer.from(have.data, 'base64') : (await fetchImageBuffer(url, 8_000))?.buffer
      return data ? grayThumb(data) : null
    }),
  )
  const index = thumbs.findIndex((thumb) => thumb && nearCopy(mine, thumb))
  return index >= 0 ? wanted[index] : undefined
}
