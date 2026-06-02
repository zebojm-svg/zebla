import { GoogleGenerativeAI } from '@google/generative-ai'
import { randomUUID } from 'crypto'
import type {
  CharacterVisual,
  Dialog,
  DialogLength,
  DialogLine,
  DialogSection,
  BirkenbihlWord,
  ChatMessage,
  LineImageBeat,
  SpeakerMood,
  SpeakerPortrait,
  PortraitFraming,
  PortraitGaze,
} from '../shared/types.js'
import { isRtlLanguage, languageName, needsRomanization } from '../shared/types.js'
import { linesFromRaw, newLineId } from './ids.js'
import { speechTextDiffersFromLineText } from '../shared/line-speech.js'
import { PHOTOREALISTIC_STYLE } from './ken-burns-style.js'
import {
  buildDialogVisualScript,
  beatsForSection,
  beatsToSpeakerPortraits,
} from './visual-script.js'
import type { DialogVisualScript } from '../shared/types.js'

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
  }))
}

export async function applyBirkenbihl(
  lines: DialogLine[],
  nativeLanguage: string,
  targetLanguage?: string,
  includeRomanization = true,
): Promise<DialogLine[]> {
  const nativeName = languageName(nativeLanguage)
  const targetName = targetLanguage ? languageName(targetLanguage) : ''
  const rtlHint =
    targetLanguage && isRtlLanguage(targetLanguage)
      ? `\nDie Zielsprache ${targetName} wird von rechts nach links gelesen. Gib die Wörter in natürlicher Lese-Reihenfolge im JSON-Array an (erstes Wort des Satzes zuerst). Jedes Wort bleibt ein eigenes Array-Element.\n`
      : ''
  const wantRoman =
    includeRomanization && targetLanguage && needsRomanization(targetLanguage)
  const romanHint = wantRoman
    ? `\nZusätzlich pro Wort "romanization": wie man das Wort in ${targetName} in lateinischen Buchstaben ausspricht (Lautumschrift zum Mitsprechen, z. B. Persisch/Dari: salām, chetoreh). Keine Übersetzung, nur Aussprache-Hilfe.\n`
    : ''

  const result = await chatJson<{
    lines: {
      text: string
      words: { text: string; translation: string; romanization?: string }[]
    }[]
  }>(
    `Du wendest die Birkenbihl-Methode an: Unter jedem Wort oder sinnvollen Worteil
steht die wörtliche Übersetzung in ${nativeName} (Muttersprache, Code: ${nativeLanguage}).
Teile zusammengesetzte Wörter sinnvoll. Interpunktion bleibt am Wort.${rtlHint}${romanHint}
Antworte als JSON:
{
  "lines": [
    {
      "text": "Originalzeile",
      "words": [{ "text": "Wort", "translation": "Übersetzung"${
        wantRoman ? ', "romanization": "lautschrift"' : ''
      } }]
    }
  ]
}`,
    JSON.stringify(lines.map((l) => l.text)),
  )

  return lines.map((line, i) => {
    const row = result.lines[i]
    const birkenbihl: BirkenbihlWord[] =
      row?.words?.map((w) => ({
        text: w.text,
        translation: w.translation,
        ...(w.romanization?.trim() ? { romanization: w.romanization.trim() } : {}),
      })) ?? []
    const updated = { ...line, birkenbihl }
    if (line.audioUrl && speechTextDiffersFromLineText(updated)) {
      return { ...updated, audioUrl: undefined }
    }
    return updated
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

function parseRetryHint(raw: string): string {
  const secMatch = raw.match(/retry in ([\d.]+)s/i)
  if (secMatch) {
    const sec = Math.ceil(parseFloat(secMatch[1]))
    return ` Erneut versuchen in ca. ${sec} Sekunden.`
  }
  return ''
}

function imageGenerationErrorMessage(raw: string): string {
  if (
    raw.includes('429') ||
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.includes('quota') ||
    raw.includes('rate limit')
  ) {
    return (
      `Bild-Limit erreicht (Google Free-Tier, Modell: ${IMAGE_MODEL}).` +
      parseRetryHint(raw) +
      ' Nur ein Bild auf einmal generieren. Für mehr Bilder: Billing im Google-Cloud-Projekt deines API-Keys aktivieren (Tier 1, ca. 0 € bei wenig Nutzung) – https://aistudio.google.com/apikey'
    )
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

export function dialogSummaryForImages(dialog: Dialog): string {
  const parts: string[] = []
  for (const sec of dialog.sections) {
    parts.push(`[${sec.title}]`)
    for (const line of sec.lines) {
      parts.push(`${line.speaker}: ${line.text}`)
    }
  }
  return parts.join('\n')
}

function uniqueSpeakers(section: DialogSection): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of section.lines) {
    if (!seen.has(line.speaker)) {
      seen.add(line.speaker)
      out.push(line.speaker)
    }
  }
  return out
}

function twoShotLayoutHint(speakers: string[]): string {
  if (speakers.length >= 2) {
    return `Medium two-shot: ${speakers[0]} on the LEFT third of the frame, ${speakers[1]} on the RIGHT third, both facing slightly toward each other, equal prominence, full upper body visible. `
  }
  if (speakers.length === 1) {
    return `Single subject ${speakers[0]} centered, medium shot, upper body visible. `
  }
  return ''
}

export async function ensureDialogVisualScript(dialog: Dialog): Promise<DialogVisualScript> {
  return buildDialogVisualScript(dialog, chatJson, dialogSummaryForImages(dialog))
}

export async function buildCharacterBible(dialog: Dialog): Promise<CharacterVisual[]> {
  const speakers = new Map<string, string[]>()
  for (const sec of dialog.sections) {
    for (const line of sec.lines) {
      const list = speakers.get(line.speaker) ?? []
      if (list.length < 3) list.push(line.text)
      speakers.set(line.speaker, list)
    }
  }
  const cast = [...speakers.entries()].map(([name, lines]) => ({
    name,
    sampleLines: lines,
  }))

  const result = await chatJson<{ characters: CharacterVisual[] }>(
    `Du planst Fotos für einen Sprachlern-Dialog. Lies den gesamten Dialog und definiere für JEDE sprechende Person ein festes visuelles Erscheinungsbild (englisch), das auf ALLEN Bildern gleich bleiben soll.

Regeln:
- name: exakt wie im Dialog (z.B. Ramo, Shome)
- gender: "male" | "female" – aus Kontext und Namen
- description: 1–2 Sätze Englisch: young adult, attractive, well-groomed, Haare, Kleidung, Hautfarbe, unverwechselbare Merkmale
- Nur Personen, die im Dialog vorkommen
- Stil: photorealistic cinematic still (keine Cartoon-/Flat-Illustration)

JSON:
{ "characters": [{ "name": "Ramo", "gender": "male", "description": "photorealistic young man with ..." }] }`,
    `Titel: "${dialog.title}"\n\nDialog:\n${dialogSummaryForImages(dialog)}\n\nSprecher mit Beispielzeilen:\n${JSON.stringify(cast)}`,
  )

  if (!result.characters?.length) {
    throw new Error('KI konnte keine Figuren-Beschreibung erstellen.')
  }
  return result.characters
}

export function formatCharacterBibleForPrompt(bible: CharacterVisual[]): string {
  return bible.map((c) => `${c.name}: ${c.description}`).join('; ')
}

function buildConsistentImagePrompt(scenePrompt: string, bible?: CharacterVisual[]): string {
  const cast =
    bible?.length ?
      `SAME characters in every image (do not change faces or outfits): ${formatCharacterBibleForPrompt(bible)}. `
    : ''
  return `${cast}${scenePrompt}. ${PHOTOREALISTIC_STYLE}`
}

function buildImagePrompt(
  section: DialogSection,
  dialogTitle: string,
  bible?: CharacterVisual[],
): string {
  const speakers = uniqueSpeakers(section)
  const snippet = section.lines
    .slice(0, 5)
    .map((l) => `${l.speaker}: ${l.text}`)
    .join(' ')
  return buildConsistentImagePrompt(
    `${twoShotLayoutHint(speakers)}Scene for language learning dialog "${dialogTitle}", section "${section.title}". ${snippet}`,
    bible,
  )
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
  bible?: CharacterVisual[],
): Promise<{ imageUrl: string; prompt: string }> {
  const prompt = buildImagePrompt(section, dialogTitle, bible)
  const imageUrl = await generateImageDataUrl(prompt)
  return { imageUrl, prompt }
}

export async function planSpeakerPortraits(
  section: DialogSection,
  dialog: Dialog,
): Promise<SpeakerPortrait[]> {
  let script = dialog.visualScript
  if (!script?.beats?.length) {
    script = await ensureDialogVisualScript(dialog)
  }
  const beats = beatsForSection(script, section.id)
  if (beats.length) return beatsToSpeakerPortraits(beats)
  return planSpeakerPortraitsLegacy(section, dialog)
}

async function planSpeakerPortraitsLegacy(
  section: DialogSection,
  dialog: Dialog,
): Promise<SpeakerPortrait[]> {
  const bible = dialog.characterBible
  const sectionSpeakers = uniqueSpeakers(section)
  const indexed = section.lines.map((line, index) => ({
    lineIndex: index,
    speaker: line.speaker,
    text: line.text,
  }))

  const result = await chatJson<{
    lineMoods: {
      lineIndex: number
      mood: SpeakerMood
      gaze: PortraitGaze
      addressee: string
      reason: string
    }[]
    sceneHint: string
    defaultFraming: PortraitFraming
  }>(
    `Du planst SPRECHER-BILDER für eine Sprachlern-Diashow – wie in einem echten Gespräch von der Seite mitzuerleben.

PERSPEKTIVE (sehr wichtig):
- Der Zuschauer sitzt NEBEN dem Gesprächspartner und sieht den aktiven Sprecher an.
- Der Sprecher schaut seinen Gegenüber an (addressee) – NIEMALS in die Kamera / den Zuschauer.
- Beim Sprecherwechsel wechselt die Perspektive klar zum jeweils anderen Sprecher.
- Kein „Talking Head“ zum Betrachter – es soll sich wie ein Dialog zwischen zwei Personen anfühlen.

WICHTIG – Zuerst den GESAMTEN Dialog lesen, dann für JEDE Zeile Mimik und Blick planen.

${bible?.length ? `FESTE FIGUREN:\n${formatCharacterBibleForPrompt(bible)}\n` : ''}
Sprecher in diesem Abschnitt: ${sectionSpeakers.join(', ')}

Schritt 1: Emotionaler Verlauf verstehen.
Schritt 2: Pro Zeile (lineIndex 0..${section.lines.length - 1}) mood, gaze und addressee festlegen.

Regeln:
- lineMoods: ein Eintrag pro Zeile mit lineIndex, mood, gaze, addressee, reason (Deutsch, kurz)
- mood: "neutral" | "surprised" | "sad" – passend zum Zeileninhalt
- Pro Sprecher dürfen 2–4 verschiedene Stimmungen/Blickrichtungen vorkommen (je nach Dialog)
- gaze: "at_partner" (schaut Gegenüber an) | "aside" ( seitlich weg) | "down" ( nach unten, nachdenklich) | "away" ( in die Ferne / abgewandt)
- addressee: Name des Gesprächspartners, den diese Zeile anspricht (aus dem Dialog, meist der andere Sprecher)
- sceneHint: kurzer englischer Kontext (Ort, Situation)
- defaultFraming: "three_quarter" | "full_body" | "bust" – Brustbild oder Ganzkörper, keine extreme Gesichtsnahaufnahme

JSON:
{
  "lineMoods": [
    { "lineIndex": 0, "mood": "neutral", "gaze": "at_partner", "addressee": "Shome", "reason": "Begrüßung an Partner" }
  ],
  "sceneHint": "two people talking at a café table",
  "defaultFraming": "three_quarter"
}`,
    `Gesamter Dialog:\n${dialogSummaryForImages(dialog)}\n\n---\nAbschnitt: "${section.title}"\nZeilen:\n${JSON.stringify(indexed)}`,
  )

  if (!result.lineMoods?.length) {
    throw new Error('KI konnte keine Mimik pro Zeile planen.')
  }

  const moodExpr: Record<SpeakerMood, string> = {
    neutral: 'calm friendly expression while speaking, natural relaxed face',
    surprised: 'surprised expression, raised eyebrows, reacting to what the partner just said',
    sad: 'gentle sad or thoughtful expression, soft melancholy',
  }

  const gazeExpr: Record<PortraitGaze, string> = {
    at_partner:
      'looking at their conversation partner off-camera with engaged natural eye contact, facing the partner, NOT looking at the camera',
    aside: 'glancing slightly to the side while speaking, natural conversational gesture, NOT looking at the camera',
    down: 'looking down briefly with a thoughtful or hesitant expression, NOT looking at the camera',
    away: 'gazing away into the distance or slightly turned away, reflective moment, NOT looking at the camera',
  }

  const framingExpr: Record<PortraitFraming, string> = {
    bust: 'medium shot from chest up, head and shoulders visible, natural conversational distance, NOT a tight face-only close-up',
    three_quarter:
      'three-quarter shot from head to mid-thigh, full upper body visible, natural seated or standing dialogue pose',
    full_body:
      'full body shot, entire person visible from head to feet in the environment, natural conversational pose',
  }

  const validMoods = new Set<SpeakerMood>(['neutral', 'surprised', 'sad'])
  const validGaze = new Set<PortraitGaze>(['at_partner', 'aside', 'down', 'away'])
  const validFraming = new Set<PortraitFraming>(['bust', 'three_quarter', 'full_body'])
  const defaultFraming = validFraming.has(result.defaultFraming as PortraitFraming)
    ? (result.defaultFraming as PortraitFraming)
    : 'three_quarter'
  const scene = result.sceneHint?.trim() || section.title

  const sorted = [...result.lineMoods]
    .filter((lm) => lm.lineIndex >= 0 && lm.lineIndex < section.lines.length)
    .sort((a, b) => a.lineIndex - b.lineIndex)

  const covered = new Set(sorted.map((lm) => lm.lineIndex))
  for (let i = 0; i < section.lines.length; i++) {
    if (!covered.has(i)) {
      const addressee = inferAddressee(section, i, sectionSpeakers)
      sorted.push({
        lineIndex: i,
        mood: 'neutral',
        gaze: 'at_partner',
        addressee,
        reason: 'Standard',
      })
    }
  }
  sorted.sort((a, b) => a.lineIndex - b.lineIndex)

  const portraits: SpeakerPortrait[] = []
  let group: {
    speaker: string
    mood: SpeakerMood
    gaze: PortraitGaze
    addressee: string
    lineIndices: number[]
    reasons: string[]
  } | null = null

  for (const lm of sorted) {
    const line = section.lines[lm.lineIndex]
    const mood = validMoods.has(lm.mood as SpeakerMood) ? (lm.mood as SpeakerMood) : 'neutral'
    const gaze = validGaze.has(lm.gaze as PortraitGaze) ? (lm.gaze as PortraitGaze) : 'at_partner'
    const addressee =
      lm.addressee?.trim() ||
      inferAddressee(section, lm.lineIndex, sectionSpeakers)
    if (
      group &&
      group.speaker === line.speaker &&
      group.mood === mood &&
      group.gaze === gaze &&
      group.addressee === addressee &&
      group.lineIndices[group.lineIndices.length - 1] === lm.lineIndex - 1
    ) {
      group.lineIndices.push(lm.lineIndex)
      if (lm.reason?.trim()) group.reasons.push(lm.reason.trim())
    } else {
      if (group) {
        portraits.push(
          buildPortraitGroup(group, defaultFraming, scene, bible, moodExpr, gazeExpr, framingExpr),
        )
      }
      group = {
        speaker: line.speaker,
        mood,
        gaze,
        addressee,
        lineIndices: [lm.lineIndex],
        reasons: lm.reason?.trim() ? [lm.reason.trim()] : [],
      }
    }
  }
  if (group) {
    portraits.push(
      buildPortraitGroup(group, defaultFraming, scene, bible, moodExpr, gazeExpr, framingExpr),
    )
  }

  if (!portraits.length) {
    throw new Error('KI konnte keine Sprecher-Porträts planen.')
  }
  return portraits
}

function inferAddressee(
  section: DialogSection,
  lineIndex: number,
  sectionSpeakers: string[],
): string {
  const speaker = section.lines[lineIndex]?.speaker
  const prev = lineIndex > 0 ? section.lines[lineIndex - 1]?.speaker : undefined
  if (prev && prev !== speaker) return prev
  const next =
    lineIndex < section.lines.length - 1 ? section.lines[lineIndex + 1]?.speaker : undefined
  if (next && next !== speaker) return next
  return sectionSpeakers.find((s) => s !== speaker) ?? sectionSpeakers[0] ?? 'partner'
}

function buildPortraitGroup(
  group: {
    speaker: string
    mood: SpeakerMood
    gaze: PortraitGaze
    addressee: string
    lineIndices: number[]
    reasons: string[]
  },
  framing: PortraitFraming,
  scene: string,
  bible: CharacterVisual[] | undefined,
  moodExpr: Record<SpeakerMood, string>,
  gazeExpr: Record<PortraitGaze, string>,
  framingExpr: Record<PortraitFraming, string>,
): SpeakerPortrait {
  const castHint = bible?.find((c) => c.name === group.speaker)?.description
  const reason = group.reasons.join('; ') || undefined
  const firstIdx = group.lineIndices[0]
  const id = `${group.speaker.replace(/\s+/g, '_')}-${group.mood}-${group.gaze}-${firstIdx}`
  const prompt =
    `Over-the-shoulder cinematic dialogue shot: camera beside ${group.addressee}, as if the viewer sits next to ${group.addressee} watching the conversation. ` +
    `${framingExpr[framing]} of ${group.speaker}${castHint ? ` (${castHint})` : ''}. ` +
    `${group.speaker} is speaking to ${group.addressee}. ${gazeExpr[group.gaze]}. ` +
    `Expression: ${moodExpr[group.mood]}. Third-person observer perspective, natural dialogue scene. ` +
    `Setting: ${scene}. Only ${group.speaker} visible in frame; ${group.addressee} is off-camera beside the viewer, do not show a second person. ` +
    `Do NOT break the fourth wall, no direct eye contact with camera or viewer. ${PHOTOREALISTIC_STYLE}`
  return {
    id,
    speaker: group.speaker,
    mood: group.mood,
    gaze: group.gaze,
    addressee: group.addressee,
    lineIndices: group.lineIndices,
    framing,
    reason,
    prompt,
  }
}

export function applySpeakerPortraits(
  lines: DialogLine[],
  portraits: SpeakerPortrait[],
): DialogLine[] {
  const byLineIndex = new Map<number, SpeakerPortrait>()
  for (const p of portraits) {
    if (!p.imageUrl) continue
    for (const idx of p.lineIndices ?? []) {
      byLineIndex.set(idx, p)
    }
  }
  const legacyBySpeaker = new Map(
    portraits.filter((p) => p.imageUrl && !p.lineIndices?.length).map((p) => [p.speaker, p] as const),
  )
  return lines.map((line, index) => {
    const portrait = byLineIndex.get(index) ?? legacyBySpeaker.get(line.speaker)
    if (!portrait?.imageUrl) return line
    return { ...line, imageUrl: portrait.imageUrl, imagePrompt: portrait.prompt }
  })
}

export async function planLineImages(
  section: DialogSection,
  dialog: Dialog,
): Promise<LineImageBeat[]> {
  const dialogTitle = dialog.title
  const bible = dialog.characterBible
  const indexed = section.lines.map((line, index) => ({
    index,
    speaker: line.speaker,
    text: line.text,
  }))

  const speakers = uniqueSpeakers(section)
  const layoutHint = twoShotLayoutHint(speakers)
  const allIndices = section.lines.map((_, i) => i)

  const result = await chatJson<{
    beats: { lineIndices: number[]; reason: string; prompt: string }[]
  }>(
    `Du planst Bilder für eine Sprachlern-Diashow. Lies ZUERST den gesamten Dialog, dann plane die Bilder für diesen Abschnitt.

${bible?.length ? `FESTE FIGUREN (müssen auf jedem Bild gleich aussehen):\n${formatCharacterBibleForPrompt(bible)}\n` : ''}
WICHTIG – Two-Shot für Sprecher-Fokus (Variante A):
- Bei 2 Sprechern: bevorzuge EIN einziges Bild für den GANZEN Abschnitt (alle Zeilen: ${JSON.stringify(allIndices)}).
- Layout im prompt: ${layoutHint || 'beide Sprecher klar getrennt links/rechts.'}
- Die App schneidet später per Zoom auf links/rechts zu – beide Personen müssen von Anfang an sichtbar sein.
- Nur bei echtem Szenenwechsel (Ort/Requisit) ein zweites Bild.

Regeln:
- Mehrere Zeilen teilen dasselbe Bild (lineIndices-Gruppe).
- Jeder Index 0..${section.lines.length - 1} genau einmal in einer Gruppe.
- prompt: englisch, photorealistic two-shot, Figurennamen, KEIN Text im Bild.

JSON:
{
  "beats": [
    { "lineIndices": [0, 1, 2], "reason": "kurz warum", "prompt": "English photorealistic two-shot prompt..." }
  ]
}`,
    `Gesamter Dialog:\n${dialogSummaryForImages(dialog)}\n\n---\nAbschnitt: "${section.title}"\nZeilen:\n${JSON.stringify(indexed)}`,
  )

  if (!result.beats?.length) {
    throw new Error('KI konnte keine Bildplanung erstellen.')
  }

  return result.beats.map((beat) => ({
    id: randomUUID(),
    lineIndices: beat.lineIndices.filter(
      (i) => i >= 0 && i < section.lines.length,
    ),
    reason: beat.reason,
    prompt: beat.prompt,
  })).filter((b) => b.lineIndices.length > 0)
}

export async function generateUploadedImage(
  prompt: string,
  dialogId: string,
  storageKey: string,
  bible?: CharacterVisual[],
): Promise<string> {
  const fullPrompt = buildConsistentImagePrompt(prompt, bible)
  const dataUrl = await generateImageDataUrl(fullPrompt)
  const { uploadDialogImage } = await import('./image-storage.js')
  try {
    return await uploadDialogImage(dataUrl, dialogId, storageKey)
  } catch {
    return dataUrl
  }
}

export function applyLineImageBeats(
  lines: DialogLine[],
  beats: LineImageBeat[],
): DialogLine[] {
  return lines.map((line, index) => {
    const beat = beats.find((b) => b.lineIndices.includes(index) && b.imageUrl)
    if (!beat?.imageUrl) return line
    return { ...line, imageUrl: beat.imageUrl, imagePrompt: beat.prompt }
  })
}

export function isAiConfigured(): boolean {
  return !!getApiKey()
}
