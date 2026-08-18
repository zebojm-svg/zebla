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
  VisualBrief,
  VisualScene,
  VisualScriptBeat,
  VisualShotType,
} from '../shared/types.js'
import { appearanceGuideFor, styleLockPrompt } from './ken-burns-style.js'
import { imagePlanningContext } from '../shared/dialog-image-context.js'
import { MOOD_PROMPT_EN, normalizeSpeakerMood, SPEAKER_MOODS } from './expression-moods.js'

type ChatJsonFn = <T>(system: string, user: string) => Promise<T>

const moodExpr = MOOD_PROMPT_EN

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

function shotTypeBlock(
  shotType: VisualShotType | undefined,
  beat: { activeSpeaker: string; addressee: string; cameraEn: string; framing: PortraitFraming },
  mustShowEn?: string,
): string {
  const prop = mustShowEn ? ` Key prop in frame: ${mustShowEn}.` : ''
  if (shotType === 'insert') {
    return (
      `INSERT CLOSE-UP of the object this line is about${mustShowEn ? `: ${mustShowEn}` : ''}. ` +
      `Fill the frame with the object (brochure page, gadget, etc.). People only as hands or tiny edge, or absent. Not a talking-head. `
    )
  }
  if (shotType === 'two_shot' || shotType === 'wide') {
    return (
      `TWO-SHOT: ${beat.activeSpeaker} AND ${beat.addressee} both fully visible. ` +
      `${beat.cameraEn}. ${framingExpr[beat.framing]}.${prop} ` +
      `They often look at the shared object, not only at each other. `
    )
  }
  return (
    `Speaker-focused shot of ${beat.activeSpeaker} (${framingExpr[beat.framing]}), ${beat.cameraEn}. ` +
    `Partner ${beat.addressee} may be partly visible.${prop} `
  )
}

function buildBeatPrompt(
  beat: Omit<VisualScriptBeat, 'id' | 'prompt' | 'imageUrl'>,
  scene: VisualScene | undefined,
  bible: CharacterVisual[] | undefined,
  brief?: VisualBrief | null,
): string {
  const artStyle = brief?.artStyle
  const styleLock = brief?.stylePromptEn || styleLockPrompt(artStyle)
  const appearance = brief?.castLockEn || appearanceGuideFor(artStyle, brief?.ageEn)
  const cast = bible?.find((c) => c.name === beat.activeSpeaker)?.description
  const allCast = bible?.length
    ? `LOCKED CAST (identical in every frame): ${formatCharacterBibleForPrompt(bible)}. `
    : ''
  const sceneBlock = scene
    ? `Scene "${scene.id}" LOCKED: ${scene.settingEn}. Background LOCKED: ${scene.backgroundEn}. Lighting LOCKED: ${scene.lightingEn}. `
    : ''
  const setupNote = beat.newSetup
    ? 'Establish this scene. '
    : 'SAME scene, background, outfits, hairstyles, body type — only pose/expression/shot size may change. '
  const director = brief?.directorPromptEn ? `${brief.directorPromptEn} ` : ''
  const extra = brief?.extraConstraintsEn ? `CORRECTIONS: ${brief.extraConstraintsEn}. ` : ''
  const critic = brief?.criticNotesEn ? `CRITIC LOCK: ${brief.criticNotesEn}. ` : ''
  return (
    `${director}${extra}${critic}${styleLock} ${setupNote}` +
    `${allCast}` +
    `${sceneBlock}` +
    shotTypeBlock(beat.shotType, beat, beat.mustShowEn) +
    `${cast ? `${beat.activeSpeaker} MUST look exactly like: ${cast}. ` : ''}` +
    `${gazeExpr[beat.gaze]}. Expression: ${beat.expressionEn || moodExpr[beat.mood]}. ` +
    `Do not change clothing, hair color, face shape or age. No speech bubbles, no captions, no text in the image. ` +
    `NOT looking at viewer. ${appearance}`
  )
}

export async function buildDialogVisualScript(
  dialog: Dialog,
  chatJson: ChatJsonFn,
  dialogSummary: string,
): Promise<DialogVisualScript> {
  const imageContext = imagePlanningContext(dialog)
  const moodList = SPEAKER_MOODS.join(' | ')
  const sectionsPayload = dialog.sections.map((sec) => ({
    sectionId: sec.id,
    title: sec.title,
    lines: sec.lines.map((line, lineIndex) => ({
      lineIndex,
      speaker: line.speaker,
      text: line.text,
    })),
  }))

  const bible = dialog.characterBible
  const brief = dialog.visualBrief
  const pictureStory = brief?.cameraLanguage === 'picture_story'
  const styleNote = brief
    ? `STIL: ${brief.artStyle}. ALTER: ${brief.ageEn}. ${brief.directorPromptEn}`
    : 'Wenn der Nutzer Zeichnung/Jugendliche/Bildergeschichte will, NICHT automatisch Foto-Erwachsene und Schulterkamera wählen.'

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
      shotType?: VisualShotType
      mustShowEn?: string
    }[]
    defaultFraming: PortraitFraming
  }>(
    `Du erstellst ein BILDERSKRIPT für eine Sprachlern-Diashow.

${styleNote}

Zuerst den GESAMTEN Dialog lesen und verstehen (Handlung, Orte, Gegenstände, über die gesprochen wird).

${bible?.length ? `FESTE FIGUREN (Aussehen auf ALLEN Bildern IDENTISCH – Kleidung, Frisur, Gesicht):\n${formatCharacterBibleForPrompt(bible)}\n` : ''}

${brief?.mustShowEn?.length ? `PFLICHT-REQUISITEN in Zimmershots: ${brief.mustShowEn.join('; ')}\n` : ''}
${brief?.insertPlan?.length ? `GEPLANTE INSERTS (globalLineIndex → Gegenstand): ${JSON.stringify(brief.insertPlan)}\n` : ''}

SZENEN (scenes):
- Wenige wiederkehrende Schauplätze mit festem Hintergrund und Licht.
- Für Bildergeschichten extra eine Insert-Szene (z.B. prospectus_closeup) anlegen und auch BENUTZEN.

PRO ZEILE (linePlans):
- shotType: ${pictureStory ? 'two_shot | insert | speaker | wide — wechsle bewusst. Insert wenn die Zeile einen Gegenstand nennt (Prospekt, Roboter, Zahnpasta…). Two-shot oft beide Personen + Gegenstand. NICHT 20× speaker/OTS.' : 'speaker ist erlaubt; trotzdem Insert wenn ein Gegenstand zentral ist.'}
- mood: ${moodList} – MUSS zum Zeileninhalt passen (Humor → laughing/surprised, Skepsis nicht neutral-freundlich)
- newSetup: true bei Ortwechsel, Insert, Kameraseite; false = nur Mimik
- cameraEn: englisch
- mustShowEn: was in DIESEM Bild sichtbar sein muss
- expressionEn: NUR Gesichtsausdruck
- gaze: at_partner | aside | down | away — bei Insert/Gegenstand: down

KONSISTENZ: Gleiche Kleidung, Frisur, Gesicht, Alter. Jede Person andere KleidungsFARBE.

JSON:
{
  "scenes": [{ "id": "cafe", "title": "Café", "settingEn": "...", "backgroundEn": "...", "lightingEn": "..." }],
  "linePlans": [{ "sectionId": "...", "lineIndex": 0, "sceneId": "cafe", "activeSpeaker": "Ubaid", "addressee": "Shome", "mood": "neutral", "gaze": "at_partner", "newSetup": true, "cameraEn": "...", "expressionEn": "...", "reason": "...", "shotType": "two_shot", "mustShowEn": "..." }],
  "defaultFraming": "three_quarter"
}`,
    `${imageContext ? `${imageContext}\n\n---\n` : ''}Dialog "${dialog.title}"\n\n${dialogSummary}\n\nAbschnitte:\n${JSON.stringify(sectionsPayload)}`,
  )

  const validMoods = new Set<SpeakerMood>(SPEAKER_MOODS)
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
        const insert = brief?.insertPlan?.find((p) => {
          const start = dialog.sections
            .slice(0, dialog.sections.findIndex((s) => s.id === section.id))
            .reduce((n, s) => n + s.lines.length, 0)
          return p.globalLineIndex === start + i
        })
        plans.push({
          sectionId: section.id,
          lineIndex: i,
          sceneId: insert ? 'insert_prop' : result.scenes?.[0]?.id ?? 'main',
          activeSpeaker: section.lines[i].speaker,
          addressee: inferAddressee(section, i, speakers),
          mood: 'neutral',
          gaze: insert ? 'down' : 'at_partner',
          newSetup: i === 0 || Boolean(insert),
          cameraEn: insert
            ? `close-up of ${insert.whatEn}`
            : `two-shot of ${section.lines[i].speaker} and ${inferAddressee(section, i, speakers)}`,
          expressionEn: 'neutral friendly',
          reason: insert ? `Insert: ${insert.whatEn}` : 'Standard',
          shotType: insert ? 'insert' : pictureStory ? 'two_shot' : 'speaker',
          mustShowEn: insert?.whatEn ?? brief?.mustShowEn[0],
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
      shotType: VisualShotType
      mustShowEn?: string
    } | null = null

    const validShots = new Set<VisualShotType>(['two_shot', 'insert', 'speaker', 'wide'])

    for (const plan of plans) {
      if (plan.lineIndex < 0 || plan.lineIndex >= section.lines.length) continue
      const mood = normalizeSpeakerMood(plan.mood)
      const gaze = validGaze.has(plan.gaze as PortraitGaze) ? (plan.gaze as PortraitGaze) : 'at_partner'
      const addressee = plan.addressee?.trim() || inferAddressee(section, plan.lineIndex, speakers)
      const sceneId = plan.sceneId?.trim() || 'main'
      const cameraEn = plan.cameraEn?.trim() || `beside ${addressee} watching ${plan.activeSpeaker}`
      const shotType = validShots.has(plan.shotType as VisualShotType)
        ? (plan.shotType as VisualShotType)
        : pictureStory
          ? 'two_shot'
          : 'speaker'
      const mustShowEn = plan.mustShowEn?.trim() || brief?.mustShowEn[0]

      if (
        group &&
        group.sceneId === sceneId &&
        group.activeSpeaker === plan.activeSpeaker &&
        group.addressee === addressee &&
        group.mood === mood &&
        group.gaze === gaze &&
        group.cameraEn === cameraEn &&
        group.shotType === shotType &&
        group.lineIndices[group.lineIndices.length - 1] === plan.lineIndex - 1
      ) {
        group.lineIndices.push(plan.lineIndex)
        if (plan.reason?.trim()) group.reasons.push(plan.reason.trim())
      } else {
        if (group) {
          beats.push(
            finalizeBeat(section.id, group, defaultFraming, sceneMap, bible, brief),
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
          shotType,
          mustShowEn,
        }
      }
    }
    if (group) {
      beats.push(finalizeBeat(section.id, group, defaultFraming, sceneMap, bible, brief))
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
    shotType: VisualShotType
    mustShowEn?: string
  },
  framing: PortraitFraming,
  sceneMap: Map<string, VisualScene>,
  bible: CharacterVisual[] | undefined,
  brief?: VisualBrief | null,
): VisualScriptBeat {
  const firstIdx = group.lineIndices[0]
  const id = `${group.activeSpeaker.replace(/\s+/g, '_')}-${group.sceneId}-${group.shotType}-${group.mood}-${firstIdx}`
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
    shotType: group.shotType,
    mustShowEn: group.mustShowEn,
  }
  return {
    id,
    ...partial,
    prompt: buildBeatPrompt(partial, sceneMap.get(group.sceneId), bible, brief),
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
