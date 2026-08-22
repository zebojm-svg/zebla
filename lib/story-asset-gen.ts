import { getStoryStylePrompt, getStoryArtStyle, type StoryArtStyleId } from '../shared/story-art-styles.js'
import {
  armPosePrompt,
  headAnglePrompt,
  legPosePrompt,
  type ArmPoseId,
  type HeadAngleId,
  type LegPoseId,
} from '../shared/character-parts.js'
import {
  resolveStoryCharacterAppearance,
  STORY_CHARACTER_ANATOMY_PROMPT,
  STORY_CHARACTER_CUTOUT_PROMPT,
  STORY_CHARACTER_FRAMING_PROMPT,
  STORY_CHARACTER_MASK_PROMPT,
  STORY_CHARACTER_PART_MASK_PROMPT,
} from '../shared/story-character-looks.js'
import type { CharacterRig } from '../shared/character-rig.js'
import { applyPersonMask, splitCharacterRigPng } from './story-image-processing.js'

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

const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL
  ?.replace('gemini-2.5-flash-preview-image', 'gemini-2.5-flash-image')
  .replace(/^models\//, '')
  ?? 'gemini-2.5-flash-image'

type GeminiImageResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }
  }>
  error?: { message?: string }
}

function extractGeminiImage(data: GeminiImageResponse, fallback: string): Buffer {
  if (data.error?.message) {
    const msg = data.error.message
    if (msg.includes('is not found') || msg.includes('not supported')) {
      throw new Error(
        'Bildmodell nicht verfügbar. Bitte GEMINI_IMAGE_MODEL auf gemini-2.5-flash-image setzen.',
      )
    }
    throw new Error(`Gemini: ${msg}`)
  }
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const imgPart = parts.find((p) => p.inlineData?.data)
  if (!imgPart?.inlineData?.data) {
    const textPart = parts.find((p) => p.text)
    throw new Error(textPart?.text ?? fallback)
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
  const res = await googleApiPost(
    `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`,
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
  return extractGeminiImage(data, fallback)
}

async function cutOutWithPersonMask(apiKey: string, colorPng: Buffer): Promise<Buffer> {
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
    return colorPng
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

  const res = await googleApiPost(
    `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio },
      },
    },
  )

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }
    }>
    error?: { message?: string }
  }

  if (data.error?.message) {
    const msg = data.error.message
    if (msg.includes('is not found') || msg.includes('not supported')) {
      throw new Error(
        'Bildmodell nicht verfügbar. Bitte GEMINI_IMAGE_MODEL auf gemini-2.5-flash-image setzen.',
      )
    }
    throw new Error(`Gemini: ${msg}`)
  }

  const parts = data.candidates?.[0]?.content?.parts ?? []
  const imgPart = parts.find((p) => p.inlineData?.data)
  if (!imgPart?.inlineData) {
    const textPart = parts.find((p) => p.text)
    throw new Error(textPart?.text ?? `Kein Bild generiert. Model: ${IMAGE_MODEL}`)
  }

  const buffer = Buffer.from(imgPart.inlineData.data, 'base64')
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

export async function generateStoryCharacter(
  description: string,
  name: string,
  styleId?: StoryArtStyleId,
  legPoseId?: LegPoseId,
  headAngleId?: HeadAngleId,
  armPoseId?: ArmPoseId,
  referenceImageUrl?: string,
): Promise<{ imageUrl: string; prompt: string; styleId: StoryArtStyleId; rig?: CharacterRig }> {
  const apiKey = requireGeminiKey()
  const style = getStoryStylePrompt(styleId)
  const appearance = resolveStoryCharacterAppearance(name, description)
  const legHint = legPoseId
    ? legPosePrompt(legPoseId)
    : 'standing full body, both shoes visible, empty studio margin below the feet'
  const headHint = headAngleId ? headAnglePrompt(headAngleId) : 'face toward camera, front view'
  const armHint = armPoseId ? armPosePrompt(armPoseId) : armPosePrompt('relaxed')
  const identityRule = referenceImageUrl
    ? 'The attached photo is the SAME person. Copy face, haircut, hair color, clothes and ESPECIALLY shoe model and shoe colors exactly. Do not redesign. Only the pose changes.\n'
    : ''
  const prompt =
    `${STORY_CHARACTER_FRAMING_PROMPT}\n` +
    `${style}\n\n` +
    `${identityRule}` +
    `${STORY_CHARACTER_CUTOUT_PROMPT} ` +
    `${legHint}. ${headHint}. ${armHint}.\n${appearance}\nCharacter name: ${name}\n` +
    `${STORY_CHARACTER_ANATOMY_PROMPT}\n` +
    `IMPORTANT: Only this ONE complete person from hair to shoes. No crop. No other people. Same identity as the reference if attached.`

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: prompt }]
  if (referenceImageUrl) {
    const ref = await fetchPngBuffer(referenceImageUrl)
    if (ref) {
      parts.push({ inlineData: { mimeType: 'image/png', data: ref.toString('base64') } })
    }
  }

  const colorPng = await generateGeminiPng(
    apiKey,
    parts,
    '9:16',
    50_000,
    'Kein Bild generiert.',
  )
  const cutout = await cutOutWithPersonMask(apiKey, colorPng)
  const slug = name.toLowerCase().replace(/\s+/g, '-')
  const unique2 = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const [imageUrl2, rig] = await Promise.all([
    uploadStoryAsset(cutout, `story-characters/${slug}-${unique2}.png`),
    buildCharacterRig(apiKey, cutout, slug, unique2).catch(() => undefined),
  ])

  return { imageUrl: imageUrl2, prompt, styleId: getStoryArtStyle(styleId).id, rig }
}

async function buildCharacterRig(
  apiKey: string,
  cutoutPng: Buffer,
  slug: string,
  unique: string,
): Promise<CharacterRig | undefined> {
  try {
    const partMask = await generateGeminiPng(
      apiKey,
      [
        { text: STORY_CHARACTER_PART_MASK_PROMPT },
        { inlineData: { mimeType: 'image/png', data: cutoutPng.toString('base64') } },
      ],
      '9:16',
      40_000,
      'Keine Teile-Maske erhalten.',
    )
    const split = await splitCharacterRigPng(cutoutPng, partMask)
    const [head, torso, legs] = await Promise.all([
      uploadStoryAsset(split.head, `story-characters/${slug}-${unique}-head.png`),
      uploadStoryAsset(split.torso, `story-characters/${slug}-${unique}-torso.png`),
      uploadStoryAsset(split.legs, `story-characters/${slug}-${unique}-legs.png`),
    ])
    return { parts: { head, torso, legs }, joints: split.joints }
  } catch (err) {
    throw err instanceof Error ? err : new Error('Teile-Maske fehlgeschlagen.')
  }
}

export async function rigStoryCharacterFromUrl(
  imageUrl: string,
  name = 'character',
): Promise<{ imageUrl: string; rig: CharacterRig }> {
  const apiKey = requireGeminiKey()
  const res = await fetch(imageUrl)
  if (!res.ok) {
    throw new Error('Figur-Bild konnte nicht geladen werden.')
  }
  const cutout = Buffer.from(await res.arrayBuffer())
  const slug = name.toLowerCase().replace(/\s+/g, '-') || 'character'
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const rig = await buildCharacterRig(apiKey, cutout, slug, unique)
  if (!rig) {
    throw new Error('Figur konnte nicht in Kopf, Rumpf und Beine zerlegt werden. Bitte ein Ganzkörperbild nehmen.')
  }
  return { imageUrl, rig }
}

export async function generateStoryEnvironment(
  description: string,
  name: string,
  styleId?: StoryArtStyleId,
): Promise<{ imageUrl: string; prompt: string; styleId: StoryArtStyleId }> {
  const apiKey = requireGeminiKey()
  const style = getStoryStylePrompt(styleId)
  const prompt = `${style}\n\nEmpty room/environment with NO people, NO characters, NO faces, NO mannequins, NO silhouettes sitting on furniture. Show only the space, furniture, objects, lighting:\n${description}\nLocation: ${name}\nIMPORTANT: Absolutely NO people or characters. Just the empty space ready for characters to be placed in.`

  const res = await googleApiPost(
    `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '16:9' },
      },
    },
  )

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }
    }>
  }

  const parts3 = data.candidates?.[0]?.content?.parts ?? []
  const imgPart3 = parts3.find((p) => p.inlineData?.data)
  if (!imgPart3?.inlineData) {
    const textPart = parts3.find((p) => p.text)
    throw new Error(textPart?.text ?? 'Kein Bild generiert.')
  }

  const buffer3 = Buffer.from(imgPart3.inlineData.data, 'base64')
  const unique3 = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const imageUrl3 = await uploadStoryAsset(buffer3, `story-environments/${name.toLowerCase().replace(/\s+/g, '-')}-${unique3}.png`)

  return { imageUrl: imageUrl3, prompt, styleId: getStoryArtStyle(styleId).id }
}
