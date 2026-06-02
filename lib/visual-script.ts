import { randomUUID } from 'crypto'
import type {
  CharacterVisual,
  Dialog,
  DialogLine,
  DialogSection,
  DialogVisualScript,
  PortraitFraming,
  PortraitGaze,
  SpeakerMood,
  SpeakerPortrait,
  VisualScene,
  VisualScriptBeat,
} from '../shared/types.js'
import { PHOTOREALISTIC_STYLE } from './ken-burns-style.js'

type ChatJsonFn = <T>(system: string, user: string) => Promise<T>

const moodExpr: Record<SpeakerMood, string> = {
  neutral: 'calm friendly expression while speaking',
  surprised: 'surprised expression, raised eyebrows, reacting to partner',
  sad: 'gentle sad or thoughtful expression',
}

const gazeExpr: Record<PortraitGaze, string> = {
  at_partner:
    'looking at conversation partner off-camera, NOT at camera',
  aside: 'glancing slightly aside while speaking, NOT at camera',
  down: 'looking down thoughtfully, NOT at camera',
  away: 'gazing away reflectively, NOT at camera',
}

const framingExpr: Record<PortraitFraming, string> = {
  bust: 'medium shot chest up, conversational distance',
  three_quarter: 'three-quarter shot head to mid-thigh',
  full_body: 'full body shot head to feet in environment',
}

export function formatCharacterBibleForPrompt(bible: CharacterVisual[]): string {
  return bible.map((c) => `${c.name}: ${c.description}`).join('; ')
}

function inferAddressee(
  section: DialogSection,
  lineIndex: number,
  speakers: string[],
): string {
  const speaker = section.lines[lineIndex]?.speaker
  const prev = lineIndex > 0 ? section.lines[lineIndex - 1]?.speaker : undefined
  if (prev && prev !== speaker) return prev
  const next =
    lineIndex < section.lines.length - 1 ? section.lines[lineIndex + 1]?.speaker : undefined
  if (next && next !== speaker) return next
  return speakers.find((s) => s !== speaker) ?? speakers[0] ?? 'partner'
}

function buildBeatPrompt(
  beat: Omit<VisualScriptBeat, 'id' | 'prompt' | 'imageUrl'>,
  scene: VisualScene | undefined,
  bible: CharacterVisual[] | undefined,
): string {
  const cast = bible?.find((c) => c.name === beat.activeSpeaker)?.description
  const sceneBlock = scene
    ? `Scene "${scene.id}" LOCKED: ${scene.settingEn}. Background LOCKED: ${scene.backgroundEn}. Lighting: ${scene.lightingEn}. `
    : ''
  const setupNote = beat.newSetup
    ? 'Establish this visual setup for the comic panel. '
    : 'SAME scene, background, outfits, hairstyles and camera angle as the established setup — ONLY facial expression changes. '
  return (
    `Comic panel for language-learning dialog. ${setupNote}` +
    `${sceneBlock}` +
    `Over-the-shoulder shot: ${beat.cameraEn}. ` +
    `${framingExpr[beat.framing]} of ${beat.activeSpeaker}${cast ? ` (${cast})` : ''}, speaking to ${beat.addressee} off-camera. ` +
    `${gazeExpr[beat.gaze]}. Expression: ${beat.expressionEn || moodExpr[beat.mood]}. ` +
    `Character appearance MUST match exactly across all panels (same clothes, hair, face). ` +
    `Single visible speaker in frame; partner off-camera. No speech bubbles, no text. ` +
    `NOT looking at viewer. ${PHOTOREALISTIC_STYLE}`
  )
}

export async function buildDialogVisualScript(
  dialog: Dialog,
  chatJson: ChatJsonFn,
  dialogSummary: string,
): Promise<DialogVisualScript> {
  const bible = dialog.characterBible
  const sectionsPayload = dialog.sections.map((sec) => ({
    sectionId: sec.id,
    title: sec.title,
    lines: sec.lines.map((line, lineIndex) => ({
      lineIndex,
      speaker: line.speaker,
      text: line.text,
    })),
  }))

  const result = await chatJson<{
    scenes: VisualScene[]
    linePlans: {
      sectionId: string
      lineIndex: number
      sceneId: string
      activeSpeaker: string
      addressee: string
      mood: SpeakerMood
      gaze: PortraitGaze
      newSetup: boolean
      cameraEn: string
      expressionEn: string
      reason: string
    }[]
    defaultFraming: PortraitFraming
  }>(
    `Du erstellst ein BILDERSKRIPT für eine Sprachlern-Diashow – wie ein Comic OHNE Sprechblasen (Audio übernimmt den Text).

Zuerst den GESAMTEN Dialog lesen und verstehen (Handlung, Orte, wer wann dazukommt).

${bible?.length ? `FESTE FIGUREN (Aussehen auf ALLEN Bildern identisch):\n${formatCharacterBibleForPrompt(bible)}\n` : ''}

SZENEN (scenes):
- Definiere wenige wiederkehrende Schauplätze (z.B. "cafe-table", "park-bench").
- settingEn, backgroundEn, lightingEn auf Englisch – diese bleiben pro sceneId GLEICH.

PRO ZEILE (linePlans):
- sectionId + lineIndex wie im Input
- sceneId: passende Szene
- activeSpeaker, addressee: wer spricht, wen er/sie ansieht
- mood: "neutral" | "surprised" | "sad"
- gaze: "at_partner" | "aside" | "down" | "away"
- newSetup: true wenn Szene, Kamera-Seite, neue Person im Bild oder Ort wechselt; false wenn NUR Mimik/Blick sich ändert
- cameraEn: Englisch, feste Formulierung pro Gesprächspaar, z.B. "camera beside Shome watching Ubaid, viewer sits next to Shome"
- expressionEn: kurz Englisch, nur Gesicht/Mimik
- reason: Deutsch, kurz

KONSISTENZ (sehr wichtig):
- Gleiche Kleidung, Frisur, Gesicht pro Person über den ganzen Dialog (nur Mimik ändert sich).
- Beim Wechsel zwischen zwei Sprechern: Kamera immer neben dem Zuhörer, aktiver Sprecher sichtbar, schaut Partner an – NIEMALS in die Kamera.
- newSetup nur bei echtem Wechsel (neue Person, anderer Ort, andere Kameraposition).

defaultFraming: "three_quarter" | "full_body" | "bust"

JSON:
{
  "scenes": [{ "id": "cafe", "title": "Café", "settingEn": "...", "backgroundEn": "...", "lightingEn": "..." }],
  "linePlans": [{ "sectionId": "...", "lineIndex": 0, "sceneId": "cafe", "activeSpeaker": "Ubaid", "addressee": "Shome", "mood": "neutral", "gaze": "at_partner", "newSetup": true, "cameraEn": "...", "expressionEn": "...", "reason": "..." }],
  "defaultFraming": "three_quarter"
}`,
    `Dialog "${dialog.title}"\n\n${dialogSummary}\n\nAbschnitte:\n${JSON.stringify(sectionsPayload)}`,
  )

  const validMoods = new Set<SpeakerMood>(['neutral', 'surprised', 'sad'])
  const validGaze = new Set<PortraitGaze>(['at_partner', 'aside', 'down', 'away'])
  const validFraming = new Set<PortraitFraming>(['bust', 'three_quarter', 'full_body'])
  const defaultFraming = validFraming.has(result.defaultFraming as PortraitFraming)
    ? (result.defaultFraming as PortraitFraming)
    : 'three_quarter'

  const sceneMap = new Map<string, VisualScene>()
  for (const s of result.scenes ?? []) {
    if (s?.id) sceneMap.set(s.id, s)
  }

  const beats: VisualScriptBeat[] = []
  const plansBySection = new Map<string, typeof result.linePlans>()

  for (const plan of result.linePlans ?? []) {
    const list = plansBySection.get(plan.sectionId) ?? []
    list.push(plan)
    plansBySection.set(plan.sectionId, list)
  }

  for (const section of dialog.sections) {
    const speakers = [...new Set(section.lines.map((l) => l.speaker))]
    const plans = (plansBySection.get(section.id) ?? []).sort(
      (a, b) => a.lineIndex - b.lineIndex,
    )

    const covered = new Set(plans.map((p) => p.lineIndex))
    for (let i = 0; i < section.lines.length; i++) {
      if (!covered.has(i)) {
        plans.push({
          sectionId: section.id,
          lineIndex: i,
          sceneId: result.scenes?.[0]?.id ?? 'main',
          activeSpeaker: section.lines[i].speaker,
          addressee: inferAddressee(section, i, speakers),
          mood: 'neutral',
          gaze: 'at_partner',
          newSetup: i === 0,
          cameraEn: `camera beside ${inferAddressee(section, i, speakers)} watching ${section.lines[i].speaker}`,
          expressionEn: 'neutral friendly',
          reason: 'Standard',
        })
      }
    }
    plans.sort((a, b) => a.lineIndex - b.lineIndex)

    let group: {
      sceneId: string
      activeSpeaker: string
      addressee: string
      mood: SpeakerMood
      gaze: PortraitGaze
      newSetup: boolean
      cameraEn: string
      expressionEn: string
      lineIndices: number[]
      reasons: string[]
    } | null = null

    for (const plan of plans) {
      if (plan.lineIndex < 0 || plan.lineIndex >= section.lines.length) continue
      const mood = validMoods.has(plan.mood as SpeakerMood) ? (plan.mood as SpeakerMood) : 'neutral'
      const gaze = validGaze.has(plan.gaze as PortraitGaze) ? (plan.gaze as PortraitGaze) : 'at_partner'
      const addressee = plan.addressee?.trim() || inferAddressee(section, plan.lineIndex, speakers)
      const sceneId = plan.sceneId?.trim() || 'main'
      const cameraEn = plan.cameraEn?.trim() || `beside ${addressee} watching ${plan.activeSpeaker}`

      if (
        group &&
        group.sceneId === sceneId &&
        group.activeSpeaker === plan.activeSpeaker &&
        group.addressee === addressee &&
        group.mood === mood &&
        group.gaze === gaze &&
        group.cameraEn === cameraEn &&
        group.lineIndices[group.lineIndices.length - 1] === plan.lineIndex - 1
      ) {
        group.lineIndices.push(plan.lineIndex)
        if (plan.reason?.trim()) group.reasons.push(plan.reason.trim())
      } else {
        if (group) {
          beats.push(
            finalizeBeat(section.id, group, defaultFraming, sceneMap, bible),
          )
        }
        group = {
          sceneId,
          activeSpeaker: plan.activeSpeaker,
          addressee,
          mood,
          gaze,
          newSetup: Boolean(plan.newSetup),
          cameraEn,
          expressionEn: plan.expressionEn?.trim() || moodExpr[mood],
          lineIndices: [plan.lineIndex],
          reasons: plan.reason?.trim() ? [plan.reason.trim()] : [],
        }
      }
    }
    if (group) {
      beats.push(finalizeBeat(section.id, group, defaultFraming, sceneMap, bible))
    }
  }

  if (!beats.length) throw new Error('KI konnte kein Bilderskript erstellen.')

  return { version: 1, scenes: [...sceneMap.values()], beats }
}

function finalizeBeat(
  sectionId: string,
  group: {
    sceneId: string
    activeSpeaker: string
    addressee: string
    mood: SpeakerMood
    gaze: PortraitGaze
    newSetup: boolean
    cameraEn: string
    expressionEn: string
    lineIndices: number[]
    reasons: string[]
  },
  framing: PortraitFraming,
  sceneMap: Map<string, VisualScene>,
  bible: CharacterVisual[] | undefined,
): VisualScriptBeat {
  const firstIdx = group.lineIndices[0]
  const id = `${group.activeSpeaker.replace(/\s+/g, '_')}-${group.sceneId}-${group.mood}-${firstIdx}`
  const partial = {
    sectionId,
    lineIndices: group.lineIndices,
    sceneId: group.sceneId,
    activeSpeaker: group.activeSpeaker,
    addressee: group.addressee,
    mood: group.mood,
    gaze: group.gaze,
    framing,
    newSetup: group.newSetup,
    cameraEn: group.cameraEn,
    expressionEn: group.expressionEn,
    reason: group.reasons.join('; ') || undefined,
  }
  return {
    id,
    ...partial,
    prompt: buildBeatPrompt(partial, sceneMap.get(group.sceneId), bible),
  }
}

export function beatsForSection(
  script: DialogVisualScript,
  sectionId: string,
): VisualScriptBeat[] {
  return script.beats.filter((b) => b.sectionId === sectionId)
}

export function applyVisualBeats(
  lines: DialogLine[],
  beats: VisualScriptBeat[],
): DialogLine[] {
  const byIndex = new Map<number, VisualScriptBeat>()
  for (const b of beats) {
    if (!b.imageUrl) continue
    for (const idx of b.lineIndices) byIndex.set(idx, b)
  }
  return lines.map((line, index) => {
    const beat = byIndex.get(index)
    if (!beat?.imageUrl) return line
    return { ...line, imageUrl: beat.imageUrl, imagePrompt: beat.prompt }
  })
}

/** Abwärtskompatibel mit bestehender Porträt-Generierung. */
export function beatsToSpeakerPortraits(beats: VisualScriptBeat[]): SpeakerPortrait[] {
  return beats.map((b) => ({
    id: b.id,
    speaker: b.activeSpeaker,
    mood: b.mood,
    gaze: b.gaze,
    addressee: b.addressee,
    lineIndices: b.lineIndices,
    framing: b.framing,
    prompt: b.prompt,
    imageUrl: b.imageUrl,
    reason: b.reason,
  }))
}
