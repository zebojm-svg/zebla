import OpenAI from 'openai'
import { randomUUID } from 'crypto'
import type {
  DialogLength,
  DialogLine,
  DialogSection,
  BirkenbihlWord,
  ChatMessage,
} from '../shared/types.js'
import { linesFromRaw, newLineId } from './ids.js'

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

function requireOpenAI(): OpenAI {
  if (!openai) {
    throw new Error(
      'OPENAI_API_KEY ist nicht gesetzt. Bitte in den Vercel-Umgebungsvariablen konfigurieren.',
    )
  }
  return openai
}

const LENGTH_HINTS: Record<DialogLength, string> = {
  short: '4–6 Zeilen',
  medium: '8–12 Zeilen',
  long: '14–20 Zeilen',
}

async function chatJson<T>(system: string, user: string): Promise<T> {
  const client = requireOpenAI()
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('Keine Antwort von der KI erhalten.')
  return JSON.parse(content) as T
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
  const client = requireOpenAI()

  const systemPrompt = `${DIALOG_SYSTEM}

Du führst ein Gespräch mit dem Nutzer, um einen Dialog zu planen.
Sprache des Dialogs: ${targetLanguage}. Ziel-Länge: ${LENGTH_HINTS[length]}.

Wenn genug Informationen vorliegen, füge am Ende deiner Nachricht das Wort [FERTIG] ein
und liefere zusätzlich im JSON-Feld dialog den fertigen Dialog.

Antwortformat als JSON:
{
  "reply": "Deine Nachricht an den Nutzer",
  "dialog": null oder { "title": "...", "lines": [...] }
}`

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('Keine Antwort von der KI erhalten.')

  const parsed = JSON.parse(content) as {
    reply: string
    dialog?: RawDialogResponse | null
  }

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

export async function generateSectionImage(
  section: DialogSection,
  dialogTitle: string,
): Promise<{ imageUrl: string; prompt: string }> {
  const client = requireOpenAI()

  const promptResult = await chatJson<{ prompt: string }>(
    `Erstelle einen prägnanten Bild-Prompt (Englisch) für eine Illustration zu einem Sprachlern-Dialog.
Stil: freundlich, farbenfroh, illustrativ, keine Text-Overlays.
Antworte als JSON: { "prompt": "..." }`,
    `Dialog: ${dialogTitle}\nAbschnitt: ${section.title}\nInhalt:\n${section.lines.map((l) => `${l.speaker}: ${l.text}`).join('\n')}`,
  )

  const image = await client.images.generate({
    model: 'dall-e-3',
    prompt: promptResult.prompt,
    size: '1024x1024',
    n: 1,
  })

  const imageUrl = image.data[0]?.url
  if (!imageUrl) throw new Error('Kein Bild generiert.')

  return { imageUrl, prompt: promptResult.prompt }
}

export function isAiConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY
}
