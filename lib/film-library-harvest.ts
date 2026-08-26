/**
 * Standbild zerlegen und sofort in die Bibliothek legen.
 * Pro Figur eine Maske (auch bei Überlappung), Hintergrund ohne Leute.
 */

import { randomUUID } from 'crypto'
import sharp from 'sharp'
import {
  characterHarvestTags,
  cutoutRatioLooksIsolated,
  environmentHarvestTags,
  harvestBackgroundLabel,
  harvestFigureLabel,
  harvestNoteDe,
  harvestPlanFromPanel,
  masksLookLikeSameBlob,
  namedPersonExtractPrompt,
  namedPersonMaskPrompt,
  shouldSkipBackground,
  shouldSkipCharacterPose,
  STILL_BACKGROUND_EXTRACT_PROMPT,
  type HarvestFigure,
  type HarvestPiece,
} from '../shared/film-library-harvest.js'
import { binaryAlphaMask, maskIoU, opaqueRatio } from '../shared/image-person-matte.js'
import type { FilmScene, FilmStoryboardPanel } from '../shared/film-storyboard.js'
import { getStillPose } from '../shared/story-stills.js'
import type { StoryLibraryAsset } from '../shared/story-types.js'
import {
  geminiImageModelCandidates,
  isGeminiImageUnavailable,
} from './gemini-image-model.js'
import {
  applyPersonMask,
  cropToOpaqueBounds,
  pngHasUsefulAlpha,
  punchCutoutPng,
} from './story-image-processing.js'
import { listStoryAssets, saveStoryAsset } from './story-library.js'

const HARVEST_IMAGE_TIMEOUT_MS = 32_000

type GeminiImageResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }
  }>
  error?: { message?: string }
}

function requireGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY ist nicht gesetzt.')
  return key
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

async function fetchPng(url: string): Promise<Buffer> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error('Standbild konnte nicht geladen werden.')
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 32) throw new Error('Standbild leer.')
    return buf
  } finally {
    clearTimeout(timer)
  }
}

async function generateGeminiPng(
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>,
  aspectRatio: '16:9' | '9:16',
  fallback: string,
): Promise<Buffer> {
  const apiKey = requireGeminiKey()
  let lastError = fallback
  for (const model of geminiImageModelCandidates()) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), HARVEST_IMAGE_TIMEOUT_MS)
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig: { aspectRatio },
            },
          }),
          signal: controller.signal,
        },
      )
      clearTimeout(timer)
      const data = (await res.json()) as GeminiImageResponse
      if (data.error?.message) throw new Error(data.error.message)
      const img = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData
      if (!img?.data) throw new Error(fallback)
      return Buffer.from(img.data, 'base64')
    } catch (err) {
      lastError = err instanceof Error ? err.message : fallback
      if (err instanceof Error && err.name === 'AbortError') {
        lastError = 'Freistellen hat zu lange gedauert.'
      }
      if (isGeminiImageUnavailable(lastError)) continue
      throw new Error(lastError)
    }
  }
  throw new Error(lastError)
}

async function pngAlphaStats(png: Buffer): Promise<{
  ratio: number
  mask: Uint8Array
}> {
  const color = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const pixels = new Uint8Array(color.data)
  return {
    ratio: opaqueRatio(pixels, color.info.width, color.info.height),
    mask: binaryAlphaMask(pixels, color.info.width, color.info.height),
  }
}

type FigureCutout = {
  figure: HarvestFigure
  png: Buffer
  mask: Uint8Array
}

async function matteOneFigure(
  stillPng: Buffer,
  stillB64: string,
  figure: HarvestFigure,
  others: string[],
): Promise<FigureCutout> {
  const maskPng = await generateGeminiPng(
    [
      { text: namedPersonMaskPrompt(figure.name, others) },
      { inlineData: { mimeType: 'image/png', data: stillB64 } },
    ],
    '16:9',
    `Keine Maske für ${figure.name}.`,
  )
  let cutout = await applyPersonMask(stillPng, maskPng)
  let stats = await pngAlphaStats(cutout)
  if (!cutoutRatioLooksIsolated(stats.ratio) || !(await pngHasUsefulAlpha(cutout))) {
    const extracted = await generateGeminiPng(
      [
        { text: namedPersonExtractPrompt(figure.name, others) },
        { inlineData: { mimeType: 'image/png', data: stillB64 } },
      ],
      '16:9',
      `${figure.name} konnte nicht einzeln geholt werden.`,
    )
    cutout = (await pngHasUsefulAlpha(extracted)) ? extracted : await punchCutoutPng(extracted)
    stats = await pngAlphaStats(cutout)
  }
  if (!cutoutRatioLooksIsolated(stats.ratio)) {
    throw new Error(`${figure.name} konnte nicht einzeln vom Bild getrennt werden.`)
  }
  const cropped = await cropToOpaqueBounds(cutout)
  return { figure, png: cropped, mask: stats.mask }
}

function dropBlobTwins(cutouts: FigureCutout[]): {
  keep: FigureCutout[]
  blobNames: string[]
} {
  const blob = new Set<string>()
  for (let i = 0; i < cutouts.length; i++) {
    for (let j = i + 1; j < cutouts.length; j++) {
      const a = cutouts[i]!
      const b = cutouts[j]!
      if (a.mask.length !== b.mask.length) continue
      if (!masksLookLikeSameBlob(maskIoU(a.mask, b.mask))) continue
      blob.add(a.figure.name)
      blob.add(b.figure.name)
    }
  }
  return {
    keep: cutouts.filter((c) => !blob.has(c.figure.name)),
    blobNames: [...blob],
  }
}

export async function harvestFilmStillToLibrary(opts: {
  userId: string
  panel: FilmStoryboardPanel
  stillUrl: string
  scene?: FilmScene
}): Promise<{ library: StoryLibraryAsset[]; pieces: HarvestPiece[]; noteDe: string }> {
  const plan = harvestPlanFromPanel(opts.panel, opts.scene?.title)
  const pieces: HarvestPiece[] = []
  let library = await listStoryAssets(opts.userId)

  const needFigures: HarvestFigure[] = []
  for (const figure of plan.figures) {
    const label = harvestFigureLabel(figure)
    if (shouldSkipCharacterPose(library, figure.name, figure.poseId)) {
      pieces.push({ label, kind: 'character', status: 'skipped' })
    } else {
      needFigures.push(figure)
    }
  }

  const bgLabel = harvestBackgroundLabel(plan.backgroundName)
  const skipBg = shouldSkipBackground(library, plan.backgroundHint || plan.backgroundName)
  if (skipBg) pieces.push({ label: bgLabel, kind: 'environment', status: 'skipped' })

  if (needFigures.length === 0 && skipBg) {
    return { library, pieces, noteDe: harvestNoteDe(pieces) }
  }

  let stillPng: Buffer
  try {
    stillPng = await fetchPng(opts.stillUrl)
  } catch {
    for (const figure of needFigures) {
      pieces.push({
        label: harvestFigureLabel(figure),
        kind: 'character',
        status: 'failed',
        detailDe: `${harvestFigureLabel(figure)} konnte nicht freigestellt werden.`,
      })
    }
    if (!skipBg) {
      pieces.push({
        label: bgLabel,
        kind: 'environment',
        status: 'failed',
        detailDe: `${bgLabel} konnte nicht gespeichert werden.`,
      })
    }
    return { library, pieces, noteDe: harvestNoteDe(pieces) }
  }

  const stillB64 = stillPng.toString('base64')
  const otherNames = plan.figures.map((f) => f.name)

  const [figureResults, bgResult] = await Promise.all([
    Promise.all(
      needFigures.map(async (figure) => {
        try {
          return { ok: true as const, figure, cutout: await matteOneFigure(stillPng, stillB64, figure, otherNames) }
        } catch {
          return { ok: false as const, figure }
        }
      }),
    ),
    skipBg
      ? Promise.resolve({ ok: false as const, skipped: true as const })
      : generateGeminiPng(
          [
            { text: STILL_BACKGROUND_EXTRACT_PROMPT },
            { inlineData: { mimeType: 'image/png', data: stillB64 } },
          ],
          '16:9',
          'Hintergrund ohne Figuren fehlgeschlagen.',
        )
          .then((png) => ({ ok: true as const, png }))
          .catch(() => ({ ok: false as const, skipped: false as const })),
  ])

  const succeeded: FigureCutout[] = []
  for (const result of figureResults) {
    if (result.ok) succeeded.push(result.cutout)
  }
  const { keep, blobNames } = dropBlobTwins(succeeded)

  for (const result of figureResults) {
    const label = harvestFigureLabel(result.figure)
    if (!result.ok) {
      pieces.push({
        label,
        kind: 'character',
        status: 'failed',
        detailDe: `${label} konnte nicht freigestellt werden.`,
      })
      continue
    }
    if (blobNames.includes(result.figure.name)) {
      pieces.push({
        label,
        kind: 'character',
        status: 'failed',
        detailDe: `${label} überlappt zu stark — nicht als eine Gruppe gespeichert.`,
      })
    }
  }

  for (const cutout of keep) {
    const pose = getStillPose(cutout.figure.poseId)
    const slug = cutout.figure.name.toLowerCase().replace(/\s+/g, '-')
    try {
      const imageUrl = await uploadPng(
        cutout.png,
        `story-characters/${slug}-${cutout.figure.poseId}-${randomUUID()}.png`,
      )
      const saved = await saveStoryAsset(opts.userId, {
        type: 'character',
        name: cutout.figure.name,
        description: `${cutout.figure.name} · ${pose.label} (aus Standbild)`,
        imageUrl,
        tags: characterHarvestTags(cutout.figure.poseId),
        legPoseId: pose.legPoseId,
        headAngleId: pose.headAngleId,
        armPoseId: pose.armPoseId,
      })
      library = [saved, ...library]
      pieces.push({
        label: harvestFigureLabel(cutout.figure),
        kind: 'character',
        status: 'saved',
      })
    } catch {
      pieces.push({
        label: harvestFigureLabel(cutout.figure),
        kind: 'character',
        status: 'failed',
        detailDe: `${harvestFigureLabel(cutout.figure)} konnte nicht gespeichert werden.`,
      })
    }
  }

  if (!skipBg) {
    if (bgResult.ok) {
      try {
        const imageUrl = await uploadPng(
          bgResult.png,
          `story-environments/${plan.backgroundName.toLowerCase().replace(/\s+/g, '-')}-${randomUUID()}.png`,
        )
        const saved = await saveStoryAsset(opts.userId, {
          type: 'environment',
          name: plan.backgroundName,
          description: plan.backgroundHint || plan.backgroundName,
          imageUrl,
          tags: environmentHarvestTags(plan.backgroundHint || plan.backgroundName),
        })
        library = [saved, ...library]
        pieces.push({ label: bgLabel, kind: 'environment', status: 'saved' })
      } catch {
        pieces.push({
          label: bgLabel,
          kind: 'environment',
          status: 'failed',
          detailDe: `${bgLabel} konnte nicht gespeichert werden.`,
        })
      }
    } else {
      pieces.push({
        label: bgLabel,
        kind: 'environment',
        status: 'failed',
        detailDe: `${bgLabel} konnte nicht ohne Figuren geholt werden.`,
      })
    }
  }

  return { library, pieces, noteDe: harvestNoteDe(pieces) }
}
