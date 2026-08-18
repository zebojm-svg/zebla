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
} from '../shared/types.js'
import {
  appearanceGuideFor,
  CAST_APPEARANCE_GUIDE,
  castIntegrityRules,
  PHOTOREALISTIC_STYLE,
  styleLockPrompt,
} from './ken-burns-style.js'
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

/** Pro Szene: wer sitzt links/rechts (erste Erwähnung = links). */
export type SceneSeating = {
  left: string
  right: string
  others: string[]
}

export function seatingForScene(
  sceneId: string,
  plans: { sceneId: string; activeSpeaker: string; addressee: string }[],
): SceneSeating | null {
  const order: string[] = []
  const seen = new Set<string>()
  for (const p of plans) {
    if (p.sceneId !== sceneId) continue
    for (const name of [p.activeSpeaker, p.addressee]) {
      const n = name?.trim()
      if (!n || seen.has(n)) continue
      seen.add(n)
      order.push(n)
    }
  }
  if (order.length < 2) {
    if (order.length === 1) return { left: order[0], right: order[0], others: [] }
    return null
  }
  return { left: order[0], right: order[1], others: order.slice(2) }
}

/**
 * Deterministische Kamera nach 180°-Regel:
 * Linker Platz → wird von rechts gefilmt, schaut nach screen-right.
 * Rechter Platz → wird von links gefilmt, schaut nach screen-left.
 */
export function cameraEnForSeating(
  activeSpeaker: string,
  addressee: string,
  seating: SceneSeating | null,
  continuity: 'locked' | 'gradual',
): string {
  if (!seating) {
    return (
      `from empty seat of ${addressee} looking across at ${activeSpeaker}, ` +
      `${addressee} completely out of frame, keep identical room geography`
    )
  }

  const onLeft = activeSpeaker === seating.left
  const onRight = activeSpeaker === seating.right
  const partner =
    onLeft ? seating.right : onRight ? seating.left : addressee

  if (onLeft) {
    return (
      `REVERSE SHOT / 180-degree rule: camera sits at ${partner}'s RIGHT-side seat looking LEFTWARD across the same table at ${activeSpeaker}. ` +
      `${activeSpeaker} occupies the LEFT half of the frame and looks toward screen-RIGHT (toward ${partner}). ` +
      `${partner} is completely out of frame. ` +
      (continuity === 'gradual'
        ? `Same continuous location as other shots in this scene; background may drift only slightly.`
        : `IDENTICAL room, furniture, window/wall placement and lighting as every other shot in this scene.`)
    )
  }

  if (onRight) {
    return (
      `REVERSE SHOT / 180-degree rule: camera sits at ${partner}'s LEFT-side seat looking RIGHTWARD across the same table at ${activeSpeaker}. ` +
      `${activeSpeaker} occupies the RIGHT half of the frame and looks toward screen-LEFT (toward ${partner}). ` +
      `${partner} is completely out of frame. ` +
      (continuity === 'gradual'
        ? `Same continuous location as other shots in this scene; background may drift only slightly.`
        : `IDENTICAL room, furniture, window/wall placement and lighting as every other shot in this scene.`)
    )
  }

  return (
    `from empty seat of ${addressee} looking at ${activeSpeaker}, ${addressee} out of frame, ` +
    `keep the locked spatial layout (${seating.left} left / ${seating.right} right)`
  )
}

function cameraEnForPictureStory(
  activeSpeaker: string,
  addressee: string,
  seating: SceneSeating | null,
  shotType?: VisualScriptBeat['shotType'],
  mustShowEn?: string,
): string {
  if (shotType === 'insert') {
    return (
      `INSERT / object close-up: ${mustShowEn?.trim() || 'the key prop named in the line'} fills the frame. ` +
      `Hands of ${activeSpeaker} optional; faces optional. Same lighting as sibling shots.`
    )
  }
  if (shotType === 'speaker') {
    return cameraEnForSeating(activeSpeaker, addressee, seating, 'locked')
  }
  if (seating?.others.length) {
    return (
      `WIDE family grouping in THIS location only: ${seating.left} LEFT, ${seating.right} RIGHT, ` +
      `also ${seating.others.join(', ')} visible at the table. All faces readable. ` +
      `Same kitchen/room as sibling shots of this scene. Do not move back to the sofa.`
    )
  }
  if (seating) {
    return (
      `TWO-SHOT, 180-degree geography: ${seating.left} on the LEFT, ${seating.right} on the RIGHT, ` +
      `BOTH faces clearly visible, looking at each other or at a shared object. ` +
      `Same room as sibling shots of THIS scene only — do not mix sofa and kitchen.`
    )
  }
  return `TWO-SHOT of ${activeSpeaker} and ${addressee}, both faces visible, this scene's location only.`
}

function spatialBlockForScene(scene: VisualScene | undefined, seating: SceneSeating | null): string {
  if (!scene && !seating) return ''
  const continuity = scene?.continuity === 'gradual' ? 'gradual' : 'locked'
  const parts: string[] = []
  if (scene) {
    parts.push(
      `SCENE LOCK "${scene.id}": setting=${scene.settingEn}. background=${scene.backgroundEn}. lighting=${scene.lightingEn}.`,
    )
    if (scene.spatialEn?.trim()) {
      parts.push(`SPATIAL MAP: ${scene.spatialEn.trim()}`)
    }
  }
  if (seating) {
    parts.push(
      `SEATING LOCK: ${seating.left} ALWAYS on the LEFT side of the shared space; ` +
        `${seating.right} ALWAYS on the RIGHT side` +
        (seating.others.length ? `; also present: ${seating.others.join(', ')}` : '') +
        `. Never swap left/right between shots.`,
    )
  }
  if (continuity === 'locked') {
    parts.push(
      `CONTINUITY=locked: This is a stationary conversation. ` +
        `Do NOT change indoor↔outdoor, time of day, weather, or room. ` +
        `Background architecture and props must match prior frames of this scene.`,
    )
  } else {
    parts.push(
      `CONTINUITY=gradual: Characters may be walking/moving. ` +
        `Background may shift slowly along the same path, but keep same weather, time of day, and outfit. ` +
        `No sudden teleport indoor↔outdoor.`,
    )
  }
  return parts.join(' ') + ' '
}

function buildBeatPrompt(
  beat: Omit<VisualScriptBeat, 'id' | 'prompt' | 'imageUrl'>,
  scene: VisualScene | undefined,
  bible: CharacterVisual[] | undefined,
  seating: SceneSeating | null,
  brief?: VisualBrief | null,
  presentNames?: string[],
): string {
  const cast = bible?.find((c) => c.name === beat.activeSpeaker)?.description
  const castNames = bible?.map((c) => c.name) ?? [beat.activeSpeaker, beat.addressee].filter(Boolean)
  const allCast = bible?.length
    ? `LOCKED CAST (identical in every frame): ${formatCharacterBibleForPrompt(bible)}. `
    : ''
  const continuity = scene?.continuity === 'gradual' ? 'gradual' : 'locked'
  const styleLock = brief?.stylePromptEn || styleLockPrompt(brief?.artStyle)
  const appearance = brief?.castLockEn || appearanceGuideFor(brief?.artStyle, brief?.ageEn)
  const director = brief?.directorPromptEn ? `${brief.directorPromptEn} ` : ''
  const extra = brief?.extraConstraintsEn ? `CORRECTIONS: ${brief.extraConstraintsEn}. ` : ''
  const pictureStory = brief?.cameraLanguage === 'picture_story'
  const setupNote =
    continuity === 'locked'
      ? 'Same locked dialog location as sibling shots — ONLY expression/pose of the visible speaker may change. '
      : 'Same continuous journey as sibling shots — background may drift slightly; outfits and lighting stay consistent. '
  const integrity = pictureStory
    ? ''
    : castIntegrityRules({
        castNames: [...new Set(castNames.filter(Boolean))],
        visibleSpeaker: beat.activeSpeaker,
        addressee: beat.addressee,
      })
  const present =
    presentNames?.filter(Boolean).length
      ? [...new Set(presentNames.filter(Boolean))]
      : [beat.activeSpeaker, beat.addressee].filter(Boolean)
  const absent = castNames.filter((n) => n && !present.includes(n))
  const peopleNote = pictureStory
    ? beat.shotType === 'insert'
      ? `INSERT of ${beat.mustShowEn || 'the named object'}; people optional. `
      : `VISIBLE IN THIS SCENE ONLY: ${present.join(', ')}. ` +
        (absent.length ? `Do NOT show ${absent.join(', ')} — they are in a different room. ` : '') +
        (present.length >= 3
          ? `Family grouping, all named faces readable. `
          : `Picture story TWO-SHOT: both faces visible. `) +
        (beat.mustShowEn ? `MUST SHOW: ${beat.mustShowEn}. ` : '')
    : `${framingExpr[beat.framing]} of ${beat.activeSpeaker}${cast ? ` — MUST look exactly like: ${cast}` : ''}, speaking toward ${beat.addressee} who is out of frame. `
  return (
    `${director}${extra}` +
    (brief ? '' : `Photorealistic cinematic dialog still (live-action, NOT comic/cartoon). `) +
    `${setupNote}` +
    `${allCast}` +
    spatialBlockForScene(scene, seating) +
    integrity +
    `Viewpoint: ${beat.cameraEn}. ` +
    peopleNote +
    `${gazeExpr[beat.gaze]}. Expression ONLY: ${beat.expressionEn || moodExpr[beat.mood]}. ` +
    `Do not change clothing, hair color, face shape or age of ${beat.activeSpeaker}. No speech bubbles, no captions. ` +
    `Widescreen 16:9 landscape composition filling the frame horizontally. ` +
    `NOT looking at viewer. ${appearance || CAST_APPEARANCE_GUIDE}. ${styleLock || PHOTOREALISTIC_STYLE}`
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
  const allSpeakers = [
    ...new Set(dialog.sections.flatMap((s) => s.lines.map((l) => l.speaker))),
  ]

  const styleNote = brief
    ? `STIL: ${brief.artStyle}. ALTER: ${brief.ageEn}. ${brief.directorPromptEn}`
    : 'Photorealistische Dialog-Szenen wie Film-Stills (KEIN Comic), außer der Nutzer verlangt ausdrücklich Zeichnung.'

  const peopleRules = pictureStory
    ? `BILDERGESCHICHTE (Bookbox):
- Ortswechsel = neue sceneId. Sofa/Wohnzimmer ist NICHT die Küche. Niemals beide Orte mischen.
- Am Anfang nur die Personen, die dort reden (z.B. Julien und Marc auf dem Sofa). Eltern erst in der Küche.
- Ruf aus einem anderen Zimmer (z.B. «À table!») = Tür/Küche, nicht die Sofa-Szene.
- Meist TWO-SHOT oder Familiengruppe mit sichtbaren Gesichtern.
- INSERTS: Nahaufnahme von genannten Objekten (Prospekt, Zeitung).
- Hinterköpfe/OTS vermeiden.`
    : `PERSONENZAHL:
- Genau die Dialogfiguren. Kamera vom Platz des Partners; Partner komplett außerhalb des Bildes (kein Hinterkopf).`

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
      shotType?: 'two_shot' | 'insert' | 'speaker' | 'wide'
      mustShowEn?: string
    }[]
    defaultFraming: PortraitFraming
  }>(
    `Du erstellst ein BILDERSKRIPT für eine Sprachlern-Diashow. ${styleNote}

Zuerst den GESAMTEN Dialog lesen (Handlung, Orte, Bewegung).

${bible?.length ? `FESTE FIGUREN:\n${formatCharacterBibleForPrompt(bible)}\n` : ''}
Sprecher: ${allSpeakers.join(', ')}

=== 3D-RAUM & KONTINUITÄT (kritisch) ===
1) Plane WENIGE Szenen. Ein normales Sitzgespräch = EINE scene. Ein Ortswechsel (Sofa→Küche) = neue scene.
2) Wechsle NICHT zwischen drinnen/draußen nur weil ein anderer Sprecher redet.
3) continuity:
   - "locked" = sitzen/stehen an einem Ort – Hintergrund IDENTISCH in allen Shots dieser Szene
   - "gradual" = Spaziergang/Fahrt – Hintergrund darf sich langsam ändern
4) spatialEn (englisch, 2–4 Sätze): feste Geografie, z.B. wer links/rechts sitzt.
5) 180°-Regel: Wenn A links sitzt und B rechts, bleibt das so.
6) newSetup=true nur bei echtem Ortswechsel oder klarer Bewegungsetappe – NICHT bei jedem Sprecherwechsel.

${peopleRules}

PRO ZEILE:
- mood: ${moodList}
- sceneId muss zu scenes[].id passen und über Sprecherwechsel hinweg GLEICH bleiben, solange der Ort gleich ist
- shotType: two_shot | insert | speaker | wide
- mustShowEn: englisch, wenn ein Objekt sichtbar sein muss (brochure, newspaper)
- expressionEn: nur Mimik

JSON:
{
  "scenes": [{
    "id": "cafe",
    "title": "Café",
    "settingEn": "small cafe booth",
    "backgroundEn": "brick wall and street window behind left seat, service counter behind right seat",
    "lightingEn": "warm afternoon window light from the left",
    "spatialEn": "Person on left seat faces right across small table; person on right seat faces left; window always behind left seat",
    "continuity": "locked"
  }],
  "linePlans": [{ "sectionId": "...", "lineIndex": 0, "sceneId": "cafe", "activeSpeaker": "Ubaid", "addressee": "Shome", "mood": "neutral", "gaze": "at_partner", "newSetup": true, "cameraEn": "...", "expressionEn": "...", "shotType": "two_shot", "mustShowEn": "colorful gadget brochure", "reason": "..." }],
  "defaultFraming": "three_quarter"
}`,
    `${imageContext ? `${imageContext}\n\n---\n` : ''}Dialog "${dialog.title}"\n\n${dialogSummary}\n\nAbschnitte:\n${JSON.stringify(sectionsPayload)}`,
  )

  const validGaze = new Set<PortraitGaze>(['at_partner', 'aside', 'down', 'away'])
  const validFraming = new Set<PortraitFraming>(['bust', 'three_quarter', 'full_body'])
  const defaultFraming = validFraming.has(result.defaultFraming as PortraitFraming)
    ? (result.defaultFraming as PortraitFraming)
    : 'three_quarter'

  const sceneMap = new Map<string, VisualScene>()
  for (const s of result.scenes ?? []) {
    if (!s?.id) continue
    const continuity = s.continuity === 'gradual' ? 'gradual' : 'locked'
    sceneMap.set(s.id, {
      ...s,
      continuity,
      spatialEn: s.spatialEn?.trim() || undefined,
    })
  }
  if (!sceneMap.size) {
    sceneMap.set('main', {
      id: 'main',
      title: 'Main',
      settingEn: 'shared conversation space',
      backgroundEn: 'consistent interior or outdoor setting matching the dialog',
      lightingEn: 'natural even light',
      spatialEn: `${allSpeakers[0] ?? 'Speaker A'} on the left, ${allSpeakers[1] ?? 'Speaker B'} on the right, facing each other`,
      continuity: 'locked',
    })
  }

  // Wenn das Modell zu viele Szenen ohne Ortswechsel erzeugt: auf erste Szene zusammenziehen,
  // außer continuity=gradual oder Titel deutet klar auf Ortswechsel hin.
  const primarySceneId = [...sceneMap.keys()][0]

  const beats: VisualScriptBeat[] = []
  const plansBySection = new Map<string, typeof result.linePlans>()

  for (const plan of result.linePlans ?? []) {
    const list = plansBySection.get(plan.sectionId) ?? []
    list.push(plan)
    plansBySection.set(plan.sectionId, list)
  }

  // Globale Sitzordnung aus allen Plänen (erste Erwähnung = links)
  const flatPlans = result.linePlans ?? []
  const seatingByScene = new Map<string, SceneSeating | null>()
  for (const id of sceneMap.keys()) {
    seatingByScene.set(id, seatingForScene(id, flatPlans.length ? flatPlans : [
      ...dialog.sections.flatMap((sec) =>
        sec.lines.map((line, lineIndex) => ({
          sceneId: primarySceneId,
          activeSpeaker: line.speaker,
          addressee: inferAddressee(sec, lineIndex, [...new Set(sec.lines.map((l) => l.speaker))]),
        })),
      ),
    ]))
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
          sceneId: primarySceneId,
          activeSpeaker: section.lines[i].speaker,
          addressee: inferAddressee(section, i, speakers),
          mood: 'neutral',
          gaze: 'at_partner',
          newSetup: i === 0,
          cameraEn: '',
          expressionEn: 'neutral friendly',
          reason: 'Standard',
        })
      }
    }
    plans.sort((a, b) => a.lineIndex - b.lineIndex)

    // Ortssprünge dämpfen: gleiche continuity=locked-Szenen zusammenführen wenn Modell wild wechselt
    let lastLockedSceneId: string | null = null
    for (const plan of plans) {
      let sceneId = plan.sceneId?.trim() || primarySceneId
      if (!sceneMap.has(sceneId)) sceneId = primarySceneId
      const scene = sceneMap.get(sceneId)!
      if (!pictureStory && scene.continuity !== 'gradual') {
        if (lastLockedSceneId && sceneId !== lastLockedSceneId) {
          // Behalte die bisherige locked scene statt hin und her zu springen
          sceneId = lastLockedSceneId
        }
        lastLockedSceneId = sceneId
      }
      plan.sceneId = sceneId
      const seating = seatingByScene.get(sceneId) ?? seatingForScene(sceneId, plans)
      if (!seatingByScene.has(sceneId)) seatingByScene.set(sceneId, seating)
      plan.cameraEn = pictureStory
        ? cameraEnForPictureStory(
            plan.activeSpeaker,
            plan.addressee?.trim() || inferAddressee(section, plan.lineIndex, speakers),
            seating,
            plan.shotType,
            plan.mustShowEn,
          )
        : cameraEnForSeating(
            plan.activeSpeaker,
            plan.addressee?.trim() || inferAddressee(section, plan.lineIndex, speakers),
            seating,
            scene.continuity === 'gradual' ? 'gradual' : 'locked',
          )
    }

    const presentByScene = new Map<string, string[]>()
    for (const plan of plans) {
      const sid = plan.sceneId?.trim() || primarySceneId
      const list = presentByScene.get(sid) ?? []
      if (plan.activeSpeaker && !list.includes(plan.activeSpeaker)) list.push(plan.activeSpeaker)
      presentByScene.set(sid, list)
    }

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
      shotType?: VisualScriptBeat['shotType']
      mustShowEn?: string
    } | null = null

    for (const plan of plans) {
      if (plan.lineIndex < 0 || plan.lineIndex >= section.lines.length) continue
      const mood = normalizeSpeakerMood(plan.mood)
      const gaze = validGaze.has(plan.gaze as PortraitGaze) ? (plan.gaze as PortraitGaze) : 'at_partner'
      const addressee = plan.addressee?.trim() || inferAddressee(section, plan.lineIndex, speakers)
      const sceneId = plan.sceneId?.trim() || primarySceneId
      const scene = sceneMap.get(sceneId)
      const seating = seatingByScene.get(sceneId) ?? null
      const cameraEn =
        plan.cameraEn?.trim() ||
        (pictureStory
          ? cameraEnForPictureStory(
              plan.activeSpeaker,
              addressee,
              seating,
              plan.shotType,
              plan.mustShowEn,
            )
          : cameraEnForSeating(
              plan.activeSpeaker,
              addressee,
              seating,
              scene?.continuity === 'gradual' ? 'gradual' : 'locked',
            ))

      if (
        group &&
        group.sceneId === sceneId &&
        group.activeSpeaker === plan.activeSpeaker &&
        group.addressee === addressee &&
        group.mood === mood &&
        group.gaze === gaze &&
        group.cameraEn === cameraEn &&
        group.shotType === plan.shotType &&
        group.mustShowEn === plan.mustShowEn &&
        group.lineIndices[group.lineIndices.length - 1] === plan.lineIndex - 1
      ) {
        group.lineIndices.push(plan.lineIndex)
        if (plan.reason?.trim()) group.reasons.push(plan.reason.trim())
      } else {
        if (group) {
          beats.push(
            finalizeBeat(
              section.id,
              group,
              defaultFraming,
              sceneMap,
              bible,
              seatingByScene.get(group.sceneId) ?? null,
              brief,
              presentByScene.get(group.sceneId),
            ),
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
          shotType: plan.shotType,
          mustShowEn: plan.mustShowEn,
        }
      }
    }
    if (group) {
      beats.push(
        finalizeBeat(
          section.id,
          group,
          defaultFraming,
          sceneMap,
          bible,
          seatingByScene.get(group.sceneId) ?? null,
          brief,
          presentByScene.get(group.sceneId),
        ),
      )
    }
  }

  if (!beats.length) throw new Error('KI konnte kein Bilderskript erstellen.')

  // Enrich spatialEn if missing
  for (const [id, scene] of sceneMap) {
    if (scene.spatialEn?.trim()) continue
    const seating = seatingByScene.get(id)
    if (!seating) continue
    scene.spatialEn =
      `${seating.left} sits/stands on the LEFT; ${seating.right} on the RIGHT; they face each other; ` +
      `reverse shots keep this geography (180-degree rule).`
  }

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
    shotType?: VisualScriptBeat['shotType']
    mustShowEn?: string
  },
  framing: PortraitFraming,
  sceneMap: Map<string, VisualScene>,
  bible: CharacterVisual[] | undefined,
  seating: SceneSeating | null,
  brief?: VisualBrief | null,
  presentNames?: string[],
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
    shotType: group.shotType,
    mustShowEn: group.mustShowEn,
  }
  return {
    id,
    ...partial,
    prompt: buildBeatPrompt(partial, sceneMap.get(group.sceneId), bible, seating, brief, presentNames),
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

/** Früheres Bild derselben Szene – für Hintergrund-Kontinuität. */
export function previousSceneImageUrl(
  script: DialogVisualScript | undefined,
  sceneId: string,
  currentBeatId: string,
): string | undefined {
  if (!script?.beats?.length) return undefined
  let last: string | undefined
  for (const b of script.beats) {
    if (b.id === currentBeatId) break
    if (b.sceneId === sceneId && b.imageUrl) last = b.imageUrl
  }
  return last
}
