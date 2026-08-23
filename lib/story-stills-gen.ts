/**
 * Character-Lock für Story-Standbilder.
 * Reihenfolge: FLUX Kontext (Replicate) → FLUX Kontext (Fal) → Fehler.
 * Gemini-I2I bleibt in story-asset-gen als Notnagel, nie als reines Text-zu-Bild für Posen.
 */

import {
  buildKontextEditPrompt,
  stillsEngineFromEnv,
  type StillPoseId,
  type StillsEngineId,
} from '../shared/story-stills.js'

export { stillsEngineFromEnv }

const REPLICATE_MODEL_DEFAULT = 'black-forest-labs/flux-kontext-pro'
const FAL_MODEL_DEFAULT = 'fal-ai/flux-pro/kontext'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Zeitüberschreitung bei der Bild-KI.', { cause: err })
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function envRecord(): Record<string, string | undefined> {
  return process.env as Record<string, string | undefined>
}

export function currentStillsStatus() {
  return stillsEngineFromEnv(envRecord())
}

export function replicateModelId(): string {
  return process.env.FLUX_KONTEXT_MODEL?.trim() || REPLICATE_MODEL_DEFAULT
}

export function falModelId(): string {
  return process.env.FAL_KONTEXT_MODEL?.trim() || FAL_MODEL_DEFAULT
}

async function downloadPng(url: string): Promise<Buffer> {
  const res = await fetchWithTimeout(url, {}, 40_000)
  if (!res.ok) {
    throw new Error(`Bild-Download fehlgeschlagen (${res.status}).`)
  }
  return Buffer.from(await res.arrayBuffer())
}

function dataUriFromPng(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`
}

function asImageUrl(value: unknown): string | null {
  if (typeof value === 'string' && value.startsWith('http')) return value
  if (typeof value === 'string' && value.startsWith('data:')) return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  if (value && typeof value === 'object' && 'url' in value) {
    const url = (value as { url?: unknown }).url
    if (typeof url === 'string') return url
  }
  return null
}

type ReplicatePrediction = {
  status?: string
  output?: unknown
  error?: string | { message?: string } | null
  urls?: { get?: string }
}

function replicateErrorText(err: ReplicatePrediction['error']): string {
  if (!err) return ''
  if (typeof err === 'string') return err
  return err.message ?? ''
}

async function generateWithReplicate(opts: {
  prompt: string
  imageUrl: string
  imagePng?: Buffer | null
}): Promise<Buffer> {
  const token = process.env.REPLICATE_API_TOKEN?.trim()
  if (!token) throw new Error('REPLICATE_API_TOKEN fehlt.')

  const inputImage = opts.imageUrl.startsWith('http')
    ? opts.imageUrl
    : dataUriFromPng(opts.imagePng ?? Buffer.from([]))
  if (!opts.imageUrl.startsWith('http') && !opts.imagePng) {
    throw new Error('Stamm-Bild fehlt für FLUX Kontext.')
  }

  const model = replicateModelId()
  const created = await fetchWithTimeout(
    `https://api.replicate.com/v1/models/${model}/predictions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=60',
      },
      body: JSON.stringify({
        input: {
          prompt: opts.prompt,
          input_image: inputImage,
          aspect_ratio: '9:16',
          output_format: 'png',
          safety_tolerance: 2,
        },
      }),
    },
    90_000,
  )

  const body = (await created.json()) as ReplicatePrediction
  if (!created.ok) {
    const msg = replicateErrorText(body.error) || created.statusText
    throw new Error(`Replicate FLUX Kontext: ${msg || created.status}`)
  }

  let prediction = body
  const getUrl = prediction.urls?.get
  for (let i = 0; i < 24; i++) {
    if (prediction.status === 'succeeded') {
      const out = asImageUrl(prediction.output)
      if (!out) throw new Error('Replicate lieferte kein Bild.')
      if (out.startsWith('data:')) {
        const b64 = out.split(',')[1]
        if (!b64) throw new Error('Replicate lieferte kein Bild.')
        return Buffer.from(b64, 'base64')
      }
      return downloadPng(out)
    }
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(
        `Replicate FLUX Kontext: ${replicateErrorText(prediction.error) || prediction.status}`,
      )
    }
    if (!getUrl) break
    await sleep(2500)
    const poll = await fetchWithTimeout(
      getUrl,
      { headers: { Authorization: `Bearer ${token}` } },
      20_000,
    )
    prediction = (await poll.json()) as ReplicatePrediction
  }
  throw new Error('Replicate FLUX Kontext: Zeitüberschreitung.')
}

type FalResponse = {
  images?: Array<{ url?: string }>
  detail?: string | Array<{ msg?: string }>
  error?: string
}

async function generateWithFal(opts: {
  prompt: string
  imageUrl: string
  imagePng?: Buffer | null
}): Promise<Buffer> {
  const key = process.env.FAL_KEY?.trim()
  if (!key) throw new Error('FAL_KEY fehlt.')

  const imageUrl = opts.imageUrl.startsWith('http')
    ? opts.imageUrl
    : dataUriFromPng(opts.imagePng ?? Buffer.from([]))
  if (!opts.imageUrl.startsWith('http') && !opts.imagePng) {
    throw new Error('Stamm-Bild fehlt für FLUX Kontext.')
  }

  const model = falModelId()
  const res = await fetchWithTimeout(
    `https://fal.run/${model}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Key ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: opts.prompt,
        image_url: imageUrl,
        aspect_ratio: '9:16',
        output_format: 'png',
        sync_mode: true,
      }),
    },
    90_000,
  )

  const data = (await res.json()) as FalResponse
  if (!res.ok) {
    const detail =
      typeof data.detail === 'string'
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((d) => d.msg).filter(Boolean).join('; ')
          : data.error
    throw new Error(`Fal FLUX Kontext: ${detail || res.status}`)
  }
  const url = data.images?.[0]?.url
  if (!url) throw new Error('Fal FLUX Kontext lieferte kein Bild.')
  if (url.startsWith('data:')) {
    const b64 = url.split(',')[1]
    if (!b64) throw new Error('Fal FLUX Kontext lieferte kein Bild.')
    return Buffer.from(b64, 'base64')
  }
  return downloadPng(url)
}

export async function generateLockedStillPng(opts: {
  poseId?: StillPoseId
  styleId?: string | null
  appearance?: string
  posePrompt?: string
  referenceImageUrl: string
  referencePng?: Buffer | null
}): Promise<{ buffer: Buffer; engine: StillsEngineId; prompt: string }> {
  const prompt = buildKontextEditPrompt({
    poseId: opts.poseId,
    styleId: opts.styleId,
    appearance: opts.appearance,
    posePrompt: opts.posePrompt,
  })
  const status = currentStillsStatus()
  const errors: string[] = []

  if (status.lockEngine === 'flux-kontext-replicate' || process.env.REPLICATE_API_TOKEN) {
    try {
      const buffer = await generateWithReplicate({
        prompt,
        imageUrl: opts.referenceImageUrl,
        imagePng: opts.referencePng,
      })
      return { buffer, engine: 'flux-kontext-replicate', prompt }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Replicate fehlgeschlagen')
    }
  }

  if (process.env.FAL_KEY?.trim()) {
    try {
      const buffer = await generateWithFal({
        prompt,
        imageUrl: opts.referenceImageUrl,
        imagePng: opts.referencePng,
      })
      return { buffer, engine: 'flux-kontext-fal', prompt }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Fal fehlgeschlagen')
    }
  }

  throw new Error(
    errors.length
      ? `FLUX Kontext nicht gelungen (${errors.join(' · ')}). Gemini mit Foto wird als Notnagel versucht.`
      : 'Kein FLUX-Kontext-Key. Gemini mit Foto wird als Notnagel versucht.',
  )
}

export function fluxLockAvailable(): boolean {
  return Boolean(process.env.REPLICATE_API_TOKEN?.trim() || process.env.FAL_KEY?.trim())
}
