import { randomUUID } from 'crypto'
import { geminiImageModelCandidates, isGeminiImageUnavailable } from './gemini-image-model.js'

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

/** Grobe Skizze — ein günstiges Gemini-Bild, kein FLUX. */
export async function generateCheapStoryboardSketch(opts: {
  caption: string
  expressionHint?: string
  settingHint?: string
  names?: string[]
}): Promise<string> {
  const apiKey = requireGeminiKey()
  const names = (opts.names ?? []).filter(Boolean).join(', ')
  const prompt =
    `Rough cheap STORYBOARD SKETCH thumbnail, pencil and ink, NOT a finished painting. ` +
    `Show facial expression clearly: ${opts.expressionHint || 'neutral'}. ` +
    `People: ${names || 'the characters in the caption'}. ` +
    `Action: ${opts.caption}. Place: ${opts.settingHint || 'simple background'}. ` +
    `European comic line art, gray paper, no photorealism, no logos, no text, no speech bubbles.`

  let lastError = 'Skizze fehlgeschlagen.'
  for (const model of geminiImageModelCandidates()) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig: { aspectRatio: '4:3' },
            },
          }),
        },
      )
      const data = (await res.json()) as GeminiImageResponse
      if (data.error?.message) throw new Error(data.error.message)
      const img = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData
      if (!img?.data) throw new Error('Kein Skizzenbild.')
      const buffer = Buffer.from(img.data, 'base64')
      return await uploadPng(buffer, `story-sketches/${randomUUID()}.png`)
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError
      if (isGeminiImageUnavailable(lastError)) continue
      throw err
    }
  }
  throw new Error(lastError)
}
