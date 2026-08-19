import { getStoryStylePrompt, getStoryArtStyle, type StoryArtStyleId } from '../shared/story-art-styles.js'
import { headAnglePrompt, legPosePrompt, type HeadAngleId, type LegPoseId } from '../shared/character-parts.js'
import { removeLightBackground } from './story-image-processing.js'

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

async function googleApiPost(url: string, body: object, timeoutMs = 55_000): Promise<Response> {
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

export async function generateStoryCharacter(
  description: string,
  name: string,
  styleId?: StoryArtStyleId,
  legPoseId?: LegPoseId,
  headAngleId?: HeadAngleId,
): Promise<{ imageUrl: string; prompt: string; styleId: StoryArtStyleId }> {
  const apiKey = requireGeminiKey()
  const style = getStoryStylePrompt(styleId)
  const legHint = legPoseId ? legPosePrompt(legPoseId) : 'standing naturally, full body visible'
  const headHint = headAngleId ? headAnglePrompt(headAngleId) : 'face toward camera, front view'
  const prompt =
    `${style}\n\n` +
    `Single character cutout on pure flat solid white #FFFFFF background only, no floor line, no shadow on background, ` +
    `${legHint}, ${headHint}:\n${description}\nCharacter name: ${name}\n` +
    `IMPORTANT: Only this ONE character, no room, no furniture, no other people, no gradient background.`

  const res = await googleApiPost(
    `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '3:4' },
      },
    },
  )

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }
    }>
  }

  const parts2 = data.candidates?.[0]?.content?.parts ?? []
  const imgPart2 = parts2.find((p) => p.inlineData?.data)
  if (!imgPart2?.inlineData) {
    const textPart = parts2.find((p) => p.text)
    throw new Error(textPart?.text ?? 'Kein Bild generiert.')
  }

  const buffer2 = Buffer.from(imgPart2.inlineData.data, 'base64')
  const cutout = await removeLightBackground(buffer2)
  const unique2 = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const imageUrl2 = await uploadStoryAsset(
    cutout,
    `story-characters/${name.toLowerCase().replace(/\s+/g, '-')}-${unique2}.png`,
  )

  return { imageUrl: imageUrl2, prompt, styleId: getStoryArtStyle(styleId).id }
}

export async function generateStoryEnvironment(
  description: string,
  name: string,
  styleId?: StoryArtStyleId,
): Promise<{ imageUrl: string; prompt: string; styleId: StoryArtStyleId }> {
  const apiKey = requireGeminiKey()
  const style = getStoryStylePrompt(styleId)
  const prompt = `${style}\n\nEmpty room/environment with NO people, NO characters. Show only the space, furniture, objects, lighting:\n${description}\nLocation: ${name}\nIMPORTANT: Absolutely NO people or characters. Just the empty space ready for characters to be placed in.`

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
