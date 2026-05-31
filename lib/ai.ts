import { GoogleGenerativeAI } from '@google/generative-ai'
import { randomUUID } from 'crypto'
import type {
  DialogLength,
  DialogLine,
  DialogSection,
  BirkenbihlWord,
  ChatMessage,
} from '../shared/types.js'
import { linesFromRaw, newLineId } from './ids.js'

const TEXT_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
const IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL?.replace(
    'gemini-2.5-flash-preview-image',
    'gemini-2.5-flash-image',
  ) ?? 'gemini-2.5-flash-image'

async function googleApiPost(url: string, body: object, timeoutMs = 45_000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (res.ok) return res

    const errText = await res.text()
    throw new Error(errText)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Zeitüberschreitung bei der Bildgenerierung (45 s).')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function getApiKey(): string | null {
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? null
}

function requireGeminiKey(): string {
  const key = getApiKey()
  if (!key) {
    throw new Error(
      'GEMINI_API_KEY ist nicht gesetzt. Bitte in Vercel einen Google AI Studio Key eintragen.',
    )
  }
  return key
}

function getTextModel() {
  const genAI = new GoogleGenerativeAI(requireGeminiKey())
  return genAI.getGenerativeModel({
    model: TEXT_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
    },
  })
}

function parseJson<T>(text: string): T {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  return JSON.parse(cleaned) as T
}

const LENGTH_HINTS: Record<DialogLength, string> = {
  short: '4–6 Zeilen',
  medium: '8–12 Zeilen',
  long: '14–20 Zeilen',
}

function geminiErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.message.includes('API_KEY_INVALID') || err.message.includes('API key')) {
      return 'Ungültiger GEMINI_API_KEY. Bitte in Vercel prüfen und neu deployen.'
    }
    if (err.message.includes('is not found') || err.message.includes('404 Not Found')) {
      return `Gemini-Modell „${TEXT_MODEL}“ ist nicht verfügbar. Setze GEMINI_MODEL auf z. B. gemini-2.5-flash in Vercel und deploye neu.`
    }
    return err.message
  }
  return 'KI-Anfrage fehlgeschlagen.'
}

async function chatJson<T>(system: string, user: string): Promise<T> {
  try {
    const model = getTextModel()
    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${system}\n\n---\n\n${user}` }],
        },
      ],
    })

    const content = result.response.text()
    if (!content) throw new Error('Keine Antwort von der KI erhalten.')
    return parseJson<T>(content)
  } catch (err) {
    throw new Error(geminiErrorMessage(err))
  }
}

interface RawDialogResponse {
  title: string
  lines: { speaker: string; text: string }[]
}

const DIALOG_SYSTEM = `Du bist ein Assistent für Sprachlern-Dialoge.
Erstelle natürliche, alltagsnahe Dialoge für Schüler.
Antworte IMMER als JSON mit diesem Schema:
{
  "title": "Kurzer Titel",
  "lines": [
    { "speaker": "Name A", "text": "Satz in der Zielsprache" }
  ]
}
Zwei Sprecher wechseln sich ab. Keine Markdown-Formatierung.`

export async function generateDialogFromTopic(
  topic: string,
  targetLanguage: string,
  length: DialogLength,
): Promise<{ title: string; sections: DialogSection[] }> {
  const result = await chatJson<RawDialogResponse>(
    DIALOG_SYSTEM,
    `Erstelle einen Dialog auf ${targetLanguage} zum Thema „${topic}".
Länge: ${LENGTH_HINTS[length]}.`,
  )

  return {
    title: result.title,
    sections: [
      {
        id: randomUUID(),
        title: 'Hauptteil',
        lines: linesFromRaw(result.lines),
      },
    ],
  }
}

export async function generateDialogFromSentences(
  sentences: string[],
  targetLanguage: string,
  length: DialogLength,
): Promise<{ title: string; sections: DialogSection[] }> {
  const result = await chatJson<RawDialogResponse>(
    DIALOG_SYSTEM,
    `Forme diese diktierten Sätze zu einem flüssigen Dialog auf ${targetLanguage}:
${sentences.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Ziel-Länge: ${LENGTH_HINTS[length]}. Ergänze bei Bedarf passende Antworten.`,
  )

  return {
    title: result.title,
    sections: [
      {
        id: randomUUID(),
        title: 'Hauptteil',
        lines: linesFromRaw(result.lines),
      },
    ],
  }
}

export async function chatForDialog(
  messages: ChatMessage[],
  targetLanguage: string,
  length: DialogLength,
): Promise<{ reply: string; dialog?: { title: string; sections: DialogSection[] } }> {
  const genAI = new GoogleGenerativeAI(requireGeminiKey())
  const model = genAI.getGenerativeModel({
    model: TEXT_MODEL,
    systemInstruction: `${DIALOG_SYSTEM}

Du führst ein Gespräch mit dem Nutzer, um einen Dialog zu planen.
Sprache des Dialogs: ${targetLanguage}. Ziel-Länge: ${LENGTH_HINTS[length]}.

Wenn genug Informationen vorliegen, liefere im JSON-Feld dialog den fertigen Dialog.

Antwortformat als JSON:
{
  "reply": "Deine Nachricht an den Nutzer",
  "dialog": null oder { "title": "...", "lines": [...] }
}`,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
    },
  })

  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === 'user' ? ('user' as const) : ('model' as const),
    parts: [{ text: m.content }],
  }))

  const chat = model.startChat({ history })
  const last = messages[messages.length - 1]
  const result = await chat.sendMessage(last?.content ?? '')
  const content = result.response.text()
  if (!content) throw new Error('Keine Antwort von der KI erhalten.')

  const parsed = parseJson<{
    reply: string
    dialog?: RawDialogResponse | null
  }>(content)

  let dialog: { title: string; sections: DialogSection[] } | undefined
  if (parsed.dialog?.lines?.length) {
    dialog = {
      title: parsed.dialog.title,
      sections: [
        {
          id: randomUUID(),
          title: 'Hauptteil',
          lines: linesFromRaw(parsed.dialog.lines),
        },
      ],
    }
  }

  return { reply: parsed.reply.replace('[FERTIG]', '').trim(), dialog }
}

export async function translateDialog(
  lines: DialogLine[],
  targetLanguage: string,
): Promise<DialogLine[]> {
  const result = await chatJson<{ lines: { speaker: string; text: string }[] }>(
    `Du übersetzt Dialogzeilen präzise in ${targetLanguage}.
Antworte als JSON: { "lines": [{ "speaker": "...", "text": "..." }] }
Behalte Sprecher-Namen bei. Gleiche Anzahl Zeilen.`,
    JSON.stringify(lines.map((l) => ({ speaker: l.speaker, text: l.text }))),
  )

  return result.lines.map((l, i) => ({
    id: lines[i]?.id ?? newLineId(),
    speaker: l.speaker,
    text: l.text,
    birkenbihl: undefined,
  }))
}

export async function applyBirkenbihl(
  lines: DialogLine[],
  nativeLanguage: string,
): Promise<DialogLine[]> {
  const result = await chatJson<{
    lines: { text: string; words: { text: string; translation: string }[] }[]
  }>(
    `Du wendest die Birkenbihl-Methode an: Unter jedem Wort oder sinnvollen Worteil
steht die wörtliche Übersetzung in ${nativeLanguage} (Muttersprache).
Teile zusammengesetzte Wörter sinnvoll. Interpunktion bleibt am Wort.
Antworte als JSON:
{
  "lines": [
    {
      "text": "Originalzeile",
      "words": [{ "text": "Wort", "translation": "Übersetzung" }]
    }
  ]
}`,
    JSON.stringify(lines.map((l) => l.text)),
  )

  return lines.map((line, i) => {
    const row = result.lines[i]
    const birkenbihl: BirkenbihlWord[] =
      row?.words?.map((w) => ({ text: w.text, translation: w.translation })) ?? []
    return { ...line, birkenbihl }
  })
}

export async function splitIntoSections(
  lines: DialogLine[],
): Promise<DialogSection[]> {
  const result = await chatJson<{
    sections: { title: string; lineIndices: number[] }[]
  }>(
    `Teile den Dialog in 2–5 logische Abschnitte (z.B. Begrüßung, Hauptgespräch, Abschied).
Antworte als JSON:
{
  "sections": [
    { "title": "Abschnittstitel", "lineIndices": [0, 1, 2] }
  ]
}
Jeder Index darf nur einmal vorkommen.`,
    JSON.stringify(lines.map((l, i) => ({ index: i, speaker: l.speaker, text: l.text }))),
  )

  return result.sections.map((sec) => ({
    id: randomUUID(),
    title: sec.title,
    lines: sec.lineIndices
      .filter((i) => i >= 0 && i < lines.length)
      .map((i) => lines[i]),
  }))
}

async function generateImageWithImagen(prompt: string): Promise<string> {
  const apiKey = requireGeminiKey()
  const res = await googleApiPost(
    `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:predict?key=${apiKey}`,
    {
      instances: [{ prompt }],
      parameters: { sampleCount: 1 },
    },
  )

  const data = (await res.json()) as {
    predictions?: { bytesBase64Encoded?: string }[]
  }
  const b64 = data.predictions?.[0]?.bytesBase64Encoded
  if (!b64) throw new Error('Kein Bild generiert.')
  return `data:image/png;base64,${b64}`
}

async function generateImageWithGemini(prompt: string): Promise<string> {
  const apiKey = requireGeminiKey()
  const res = await googleApiPost(
    `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    },
  )

  const data = (await res.json()) as {
    candidates?: {
      content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] }
    }[]
  }
  const inlineData = data.candidates?.[0]?.content?.parts?.find(
    (part) => part.inlineData?.data,
  )?.inlineData
  if (!inlineData?.data) throw new Error('Kein Bild generiert.')
  return `data:${inlineData.mimeType ?? 'image/png'};base64,${inlineData.data}`
}

function imageGenerationErrorMessage(raw: string): string {
  if (
    raw.includes('429') ||
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.includes('quota') ||
    raw.includes('rate limit')
  ) {
    return `Bild-Limit erreicht (Google Free-Tier, Modell: ${IMAGE_MODEL}). Bitte einige Minuten warten und nur ein Bild auf einmal generieren.`
  }
  if (raw.includes('FUNCTION_INVOCATION_TIMEOUT') || raw.includes('Zeitüberschreitung')) {
    return 'Zeitlimit überschritten. Bitte nur ein einzelnes Bild generieren und erneut versuchen.'
  }
  if (raw.includes('paid plans') || raw.includes('upgrade your account')) {
    return 'Imagen ist nur mit kostenpflichtigem Google-AI-Konto verfügbar. Entferne GEMINI_IMAGE_MODEL in Vercel oder setze gemini-2.5-flash-image.'
  }
  if (raw.includes('is not found') || raw.includes('NOT_FOUND')) {
    return `Bildmodell „${IMAGE_MODEL}“ ist nicht verfügbar. Setze GEMINI_IMAGE_MODEL auf gemini-2.5-flash-image.`
  }
  return `Bildgenerierung fehlgeschlagen: ${raw.slice(0, 280)}`
}

function buildImagePrompt(section: DialogSection, dialogTitle: string): string {
  const snippet = section.lines
    .slice(0, 3)
    .map((l) => `${l.speaker}: ${l.text}`)
    .join(' ')
  return `Friendly colorful flat illustration for a language learning dialog "${dialogTitle}", scene "${section.title}". ${snippet}. Warm educational style, no text or labels in the image.`
}

async function generateImageDataUrl(prompt: string): Promise<string> {
  try {
    if (IMAGE_MODEL.startsWith('imagen')) {
      return await generateImageWithImagen(prompt)
    }
    return await generateImageWithGemini(prompt)
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    throw new Error(imageGenerationErrorMessage(raw))
  }
}

export async function generateSectionImage(
  section: DialogSection,
  dialogTitle: string,
): Promise<{ imageUrl: string; prompt: string }> {
  const prompt = buildImagePrompt(section, dialogTitle)
  const imageUrl = await generateImageDataUrl(prompt)
  return { imageUrl, prompt }
}

export function isAiConfigured(): boolean {
  return !!getApiKey()
}
