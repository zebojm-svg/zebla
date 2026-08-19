function bufferToDataUrl(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString('base64')}`
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

const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL?.replace(
  /^models\//,
  '',
) ?? 'gemini-2.5-flash-preview-image-generation'

const STYLE_PROMPT = `Style: warm children's book watercolor illustration, soft pen outlines, 
muted warm palette (beige, cream, soft wood tones, gentle pastels), 
detailed interior/exterior with furniture and everyday objects, 
slightly whimsical proportions, natural lighting with soft shadows, 
reminiscent of European children's picture books. 
High detail on textures (wood grain, fabric patterns, paper).
NO text, NO speech bubbles, NO labels.`

export async function generateStoryScene(
  description: string,
  aspectRatio: '16:9' | '4:3' = '16:9',
): Promise<{ imageUrl: string; prompt: string }> {
  const apiKey = requireGeminiKey()
  const prompt = `${STYLE_PROMPT}\n\nScene: ${description}`

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
  }

  const parts = data.candidates?.[0]?.content?.parts ?? []
  const imgPart = parts.find((p) => p.inlineData?.data)
  if (!imgPart?.inlineData) {
    const textPart = parts.find((p) => p.text)
    throw new Error(textPart?.text ?? 'Kein Bild generiert.')
  }

  const buffer = Buffer.from(imgPart.inlineData.data, 'base64')
  const imageUrl = bufferToDataUrl(buffer, 'image/png')

  return { imageUrl, prompt }
}

export async function generateStoryCharacter(
  description: string,
  name: string,
): Promise<{ imageUrl: string; prompt: string }> {
  const apiKey = requireGeminiKey()
  const prompt = `${STYLE_PROMPT}\n\nSingle character on TRANSPARENT/WHITE background, full body, front-facing pose, standing naturally:\n${description}\nCharacter name: ${name}\nIMPORTANT: Only this ONE character, no background scene, no other people.`

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

  const parts = data.candidates?.[0]?.content?.parts ?? []
  const imgPart = parts.find((p) => p.inlineData?.data)
  if (!imgPart?.inlineData) {
    const textPart = parts.find((p) => p.text)
    throw new Error(textPart?.text ?? 'Kein Bild generiert.')
  }

  const buffer = Buffer.from(imgPart.inlineData.data, 'base64')
  const imageUrl = bufferToDataUrl(buffer, 'image/png')

  return { imageUrl, prompt }
}

export async function generateStoryEnvironment(
  description: string,
  name: string,
): Promise<{ imageUrl: string; prompt: string }> {
  const apiKey = requireGeminiKey()
  const prompt = `${STYLE_PROMPT}\n\nEmpty room/environment with NO people, NO characters. Show only the space, furniture, objects, lighting:\n${description}\nLocation: ${name}\nIMPORTANT: Absolutely NO people or characters. Just the empty space ready for characters to be placed in.`

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

  const parts = data.candidates?.[0]?.content?.parts ?? []
  const imgPart = parts.find((p) => p.inlineData?.data)
  if (!imgPart?.inlineData) {
    const textPart = parts.find((p) => p.text)
    throw new Error(textPart?.text ?? 'Kein Bild generiert.')
  }

  const buffer = Buffer.from(imgPart.inlineData.data, 'base64')
  const imageUrl = bufferToDataUrl(buffer, 'image/png')

  return { imageUrl, prompt }
}
