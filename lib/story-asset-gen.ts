import { getStoryStylePrompt, getStoryArtStyle, type StoryArtStyleId } from '../shared/story-art-styles.js'
import {
  armPosePrompt,
  faceExpressionPrompt,
  headAnglePrompt,
  legPosePrompt,
  type ArmPoseId,
  type FaceExpressionId,
  type HeadAngleId,
  type LegPoseId,
} from '../shared/character-parts.js'
import {
  resolveStoryCharacterAppearance,
  STORY_CHARACTER_ANATOMY_PROMPT,
  STORY_CHARACTER_CUTOUT_PROMPT,
  STORY_CHARACTER_FRAMING_PROMPT,
  STORY_CHARACTER_MASK_PROMPT,
} from '../shared/story-character-looks.js'
import {
  buildModularStillPrompt,
  getStillPose,
  type StillPoseId,
  type StillsEngineId,
} from '../shared/story-stills.js'
import type { CharacterRig } from '../shared/character-rig.js'
import { applyPersonMask, pngHasUsefulAlpha, punchCutoutPng, splitCharacterRigPng } from './story-image-processing.js'
import {
  geminiImageModelCandidates,
  isGeminiImageUnavailable,
} from './gemini-image-model.js'
import { fluxLockAvailable, generateLockedStillPng } from './story-stills-gen.js'

async function uploadStoryAsset(buffer: Buffer, assetPath: string): Promise<string> {
  const { adminStorage } = await import('./firebase-admin.js')
  const bucket = adminStorage().bucket()
  const file = bucket.file(assetPath)
  await file.save(buffer, {
    metadata: { contentType: 'image/png', cacheControl: 'public, max-age=86400' },
  })
  await file.makePublic()
  return `https://storage.googleapis.com/${bucket.name}/${assetPath}`
}

function requireGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY ist nicht gesetzt.')
  return key
}

async function googleApiPost(url: string, body: object, timeoutMs = 50_000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

const IMAGE_MODEL_CANDIDATES = geminiImageModelCandidates()

type GeminiImageResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }
  }>
  error?: { message?: string }
}

function extractGeminiImage(data: GeminiImageResponse, fallback: string, model: string): Buffer {
  if (data.error?.message) {
    const msg = data.error.message
    throw new Error(`Gemini (${model}): ${msg}`)
  }
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const imgPart = parts.find((p) => p.inlineData?.data)
  if (!imgPart?.inlineData?.data) {
    const textPart = parts.find((p) => p.text)
    throw new Error(textPart?.text ?? `${fallback} (Modell: ${model})`)
  }
  return Buffer.from(imgPart.inlineData.data, 'base64')
}

async function generateGeminiPng(
  apiKey: string,
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>,
  aspectRatio: '9:16' | '16:9' | '4:3',
  timeoutMs: number,
  fallback: string,
): Promise<Buffer> {
  let lastError = fallback
  for (const model of IMAGE_MODEL_CANDIDATES) {
    try {
      const res = await googleApiPost(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: { aspectRatio },
          },
        },
        timeoutMs,
      )
      const data = (await res.json()) as GeminiImageResponse
      return extractGeminiImage(data, fallback, model)
    } catch (err) {
      lastError = err instanceof Error ? err.message : fallback
      if (isGeminiImageUnavailable(lastError)) continue
      throw err
    }
  }
  throw new Error(lastError)
}

async function cutOutWithPersonMask(apiKey: string, colorPng: Buffer): Promise<Buffer> {
  if (await pngHasUsefulAlpha(colorPng)) return colorPng
  try {
    const maskPng = await generateGeminiPng(
      apiKey,
      [
        { text: STORY_CHARACTER_MASK_PROMPT },
        { inlineData: { mimeType: 'image/png', data: colorPng.toString('base64') } },
      ],
      '9:16',
      40_000,
      'Keine Personen-Maske erhalten.',
    )
    return await applyPersonMask(colorPng, maskPng)
  } catch {
    return punchCutoutPng(colorPng)
  }
}

export async function generateStoryScene(
  description: string,
  aspectRatio: '16:9' | '4:3' = '16:9',
  styleId?: StoryArtStyleId,
): Promise<{ imageUrl: string; prompt: string; styleId: StoryArtStyleId }> {
  const apiKey = requireGeminiKey()
  const style = getStoryStylePrompt(styleId)
  const prompt = `${style}\n\nScene: ${description}`

  const buffer = await generateGeminiPng(
    apiKey,
    [{ text: prompt }],
    aspectRatio,
    50_000,
    'Kein Bild generiert.',
  )
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const imageUrl = await uploadStoryAsset(buffer, `story-scenes/${unique}.png`)

  return { imageUrl, prompt, styleId: getStoryArtStyle(styleId).id }
}

async function fetchPngBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

export type StoryCharacterResult = {
  imageUrl: string
  prompt: string
  styleId: StoryArtStyleId
  engine: StillsEngineId
  locked: boolean
  stillPoseId?: StillPoseId
  rig?: CharacterRig
}

function geminiLockPrompt(opts: {
  name: string
  appearance: string
  styleId?: StoryArtStyleId
  legPoseId?: LegPoseId
  headAngleId?: HeadAngleId
  armPoseId?: ArmPoseId
  faceExpressionId?: FaceExpressionId
  stillPoseId?: StillPoseId
  hasReference: boolean
}): string {
  const style = getStoryStylePrompt(opts.styleId)
  if (opts.hasReference && opts.stillPoseId) {
    return buildModularStillPrompt({
      poseId: opts.stillPoseId,
      styleId: opts.styleId,
      appearance: opts.appearance,
    })
  }
  const still = opts.stillPoseId ? getStillPose(opts.stillPoseId) : undefined
  const legHint = still
    ? still.posePrompt
    : opts.legPoseId
      ? legPosePrompt(opts.legPoseId)
      : 'standing full body, both shoes visible, empty studio margin below the feet'
  const headHint = still
    ? ''
    : opts.headAngleId
      ? headAnglePrompt(opts.headAngleId)
      : 'face toward camera, front view'
  const armHint = still ? '' : opts.armPoseId ? armPosePrompt(opts.armPoseId) : armPosePrompt('relaxed')
  const faceHint = opts.faceExpressionId
    ? faceExpressionPrompt(opts.faceExpressionId)
    : faceExpressionPrompt('normal')
  const identityRule = opts.hasReference
    ? 'The FIRST attached image is the identity photo of THIS EXACT PERSON. Copy face, haircut, hair color, glasses, clothes, shoe model and shoe colors 1:1. Do not restyle. Do not invent a sibling. Only pose, camera angle and facial expression change.\n'
    : ''
  const poseBits = [legHint, headHint, armHint].filter(Boolean).join('. ')
  return (
    `${STORY_CHARACTER_FRAMING_PROMPT}\n` +
    `${style}\n\n` +
    `${identityRule}` +
    `${STORY_CHARACTER_CUTOUT_PROMPT} ` +
    `${poseBits}. Facial expression: ${faceHint}.\n${opts.appearance}\nCharacter name: ${opts.name}\n` +
    `${STORY_CHARACTER_ANATOMY_PROMPT}\n` +
    `IMPORTANT: Only this ONE complete person from hair to shoes. No crop. No other people. Same identity as the reference if attached.`
  )
}

export async function generateStoryCharacter(
  description: string,
  name: string,
  styleId?: StoryArtStyleId,
  legPoseId?: LegPoseId,
  headAngleId?: HeadAngleId,
  armPoseId?: ArmPoseId,
  referenceImageUrl?: string,
  faceExpressionId?: FaceExpressionId,
  stillPoseId?: StillPoseId,
  buildRig = false,
): Promise<StoryCharacterResult> {
  const appearance = resolveStoryCharacterAppearance(name, description)
  const still = stillPoseId ? getStillPose(stillPoseId) : undefined
  const resolvedLeg = still?.legPoseId ?? legPoseId
  const resolvedHead = still?.headAngleId ?? headAngleId
  const resolvedArm = still?.armPoseId ?? armPoseId
  const composedPosePrompt = still
    ? still.posePrompt
    : [
        resolvedLeg ? legPosePrompt(resolvedLeg) : '',
        resolvedHead ? headAnglePrompt(resolvedHead) : '',
        resolvedArm ? armPosePrompt(resolvedArm) : '',
        faceExpressionId ? faceExpressionPrompt(faceExpressionId) : '',
      ]
        .filter(Boolean)
        .join('. ')
  const wantLock = Boolean(referenceImageUrl)
  let colorPng: Buffer
  let prompt: string
  let engine: StillsEngineId

  if (wantLock && referenceImageUrl) {
    const refPng = await fetchPngBuffer(referenceImageUrl)
    if (!refPng) {
      throw new Error(
        'Stamm-Bild konnte nicht geladen werden. Ohne Foto zeichnet die KI ein neues Gesicht — abgebrochen.',
      )
    }
    if (fluxLockAvailable()) {
      try {
        const locked = await generateLockedStillPng({
          poseId: stillPoseId,
          posePrompt: composedPosePrompt,
          styleId,
          appearance,
          referenceImageUrl,
          referencePng: refPng,
        })
        colorPng = locked.buffer
        prompt = locked.prompt
        engine = locked.engine
      } catch {
        prompt = geminiLockPrompt({
          name,
          appearance,
          styleId,
          legPoseId: resolvedLeg,
          headAngleId: resolvedHead,
          armPoseId: resolvedArm,
          faceExpressionId,
          stillPoseId,
          hasReference: true,
        })
        colorPng = await generateGeminiPng(
          requireGeminiKey(),
          [
            { inlineData: { mimeType: 'image/png', data: refPng.toString('base64') } },
            { text: prompt },
          ],
          '9:16',
          50_000,
          'Kein Bild generiert.',
        )
        engine = 'gemini-i2i'
      }
    } else {
      prompt = geminiLockPrompt({
        name,
        appearance,
        styleId,
        legPoseId: resolvedLeg,
        headAngleId: resolvedHead,
        armPoseId: resolvedArm,
        faceExpressionId,
        stillPoseId,
        hasReference: true,
      })
      colorPng = await generateGeminiPng(
        requireGeminiKey(),
        [
          { inlineData: { mimeType: 'image/png', data: refPng.toString('base64') } },
          { text: prompt },
        ],
        '9:16',
        50_000,
        'Kein Bild generiert.',
      )
      engine = 'gemini-i2i'
    }
  } else {
    prompt = geminiLockPrompt({
      name,
      appearance,
      styleId,
      legPoseId: resolvedLeg,
      headAngleId: resolvedHead,
      armPoseId: resolvedArm,
      faceExpressionId,
      stillPoseId,
      hasReference: false,
    })
    colorPng = await generateGeminiPng(
      requireGeminiKey(),
      [{ text: prompt }],
      '9:16',
      50_000,
      'Kein Bild generiert.',
    )
    engine = 'gemini-t2i'
  }

  const apiKey = requireGeminiKey()
  const cutout = await cutOutWithPersonMask(apiKey, colorPng)
  const slug = name.toLowerCase().replace(/\s+/g, '-')
  const unique2 = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const punched = (await pngHasUsefulAlpha(cutout)) ? cutout : await punchCutoutPng(cutout)
  const imageUrl2 = await uploadStoryAsset(punched, `story-characters/${slug}-${unique2}.png`)
  const built = buildRig
    ? await buildCharacterRig(punched, slug, unique2).catch(() => undefined)
    : undefined

  return {
    imageUrl: imageUrl2,
    prompt,
    styleId: getStoryArtStyle(styleId).id,
    engine,
    locked: wantLock,
    stillPoseId,
    rig: built?.rig,
  }
}

async function buildCharacterRig(
  cutoutPng: Buffer,
  slug: string,
  unique: string,
): Promise<{ rig: CharacterRig; punchedPng: Buffer }> {
  const punchedPng = await punchCutoutPng(cutoutPng)
  const split = await splitCharacterRigPng(punchedPng)
  const [head, torso, legs] = await Promise.all([
    uploadStoryAsset(split.head, `story-characters/${slug}-${unique}-head.png`),
    uploadStoryAsset(split.torso, `story-characters/${slug}-${unique}-torso.png`),
    uploadStoryAsset(split.legs, `story-characters/${slug}-${unique}-legs.png`),
  ])
  return { rig: { parts: { head, torso, legs }, joints: split.joints }, punchedPng }
}

export async function rigStoryCharacterFromUrl(
  imageUrl: string,
  name = 'character',
): Promise<{ imageUrl: string; rig: CharacterRig }> {
  const res = await fetch(imageUrl)
  if (!res.ok) {
    throw new Error('Figur-Bild konnte nicht geladen werden.')
  }
  const cutout = Buffer.from(await res.arrayBuffer())
  const slug = name.toLowerCase().replace(/\s+/g, '-') || 'character'
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  try {
    const built = await buildCharacterRig(cutout, slug, unique)
    const punchedUrl = await uploadStoryAsset(built.punchedPng, `story-characters/${slug}-${unique}-full.png`)
    return { imageUrl: punchedUrl, rig: built.rig }
  } catch (err) {
    throw err instanceof Error
      ? err
      : new Error('Figur konnte nicht in Kopf, Rumpf und Beine zerlegt werden. Bitte ein Ganzkörperbild nehmen.')
  }
}

export async function generateStoryEnvironment(
  description: string,
  name: string,
  styleId?: StoryArtStyleId,
): Promise<{ imageUrl: string; prompt: string; styleId: StoryArtStyleId }> {
  const apiKey = requireGeminiKey()
  const style = getStoryStylePrompt(styleId)
  const prompt = `${style}\n\nEmpty room/environment with NO people, NO characters, NO faces, NO mannequins, NO silhouettes sitting on furniture. Show only the space, furniture, objects, lighting:\n${description}\nLocation: ${name}\nIMPORTANT: Absolutely NO people or characters. Just the empty space ready for characters to be placed in.`

  const buffer3 = await generateGeminiPng(
    apiKey,
    [{ text: prompt }],
    '16:9',
    50_000,
    'Kein Bild generiert.',
  )
  const unique3 = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const imageUrl3 = await uploadStoryAsset(buffer3, `story-environments/${name.toLowerCase().replace(/\s+/g, '-')}-${unique3}.png`)

  return { imageUrl: imageUrl3, prompt, styleId: getStoryArtStyle(styleId).id }
}
