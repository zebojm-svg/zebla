/**
 * Standbilder für eine Film-Szene — fertige Bilder, kein bewegter Film.
 * Bibliothek zuerst (Gesichter festhalten), Stil aus dem Film-Schritt.
 */

import { closeupSpaceLine, seatSideFromX } from './film-closeup-space.js'
import { getStoryArtStyle, getStoryStylePrompt } from './story-art-styles.js'
import { STORY_STILLS_LOCK_PROMPT } from './story-stills.js'
import { lookForCharacterName } from './story-character-looks.js'
import {
  normalizeFilmStoryboard,
  type FilmPlacement,
  type FilmStoryboard,
  type FilmStoryboardPanel,
} from './film-storyboard.js'

export function panelsForScene(
  board: FilmStoryboard | null | undefined,
  sceneId: string,
): FilmStoryboardPanel[] {
  if (!board) return []
  return normalizeFilmStoryboard(board).panels.filter((p) => p.sceneId === sceneId)
}

export function sceneStillProgress(
  panels: FilmStoryboardPanel[],
  styleId?: string,
): { total: number; done: number; pending: number } {
  const total = panels.length
  const done = panels.filter((p) => {
    if (!p.stillUrl) return false
    if (styleId && p.stillStyleId && p.stillStyleId !== styleId) return false
    return true
  }).length
  return { total, done, pending: Math.max(0, total - done) }
}

/** Welche Bilder in der Szene noch fehlen (oder den Stil nicht mehr haben). */
export function panelsNeedingStills(
  panels: FilmStoryboardPanel[],
  styleId?: string,
  force = false,
): FilmStoryboardPanel[] {
  if (force) return [...panels]
  return panels.filter((p) => {
    if (!p.stillUrl) return true
    if (styleId && p.stillStyleId && p.stillStyleId !== styleId) return true
    return false
  })
}

export function stillLibraryHintDe(panels: FilmStoryboardPanel[]): string | null {
  const missingPeople = new Set<string>()
  const missingPoses = new Set<string>()
  let bgMissing = false
  for (const panel of panels) {
    for (const pl of panel.placements) {
      if (pl.match !== 'missing') continue
      if (pl.imageUrl) missingPoses.add(`${pl.name} (${pl.poseHint})`)
      else missingPeople.add(pl.name)
    }
    if (panel.background.match === 'missing') bgMissing = true
  }
  if (missingPeople.size === 0 && missingPoses.size === 0 && !bgMissing) return null
  const bits: string[] = []
  if (missingPeople.size > 0) {
    bits.push(`${[...missingPeople].join(', ')} fehlt noch in der Bibliothek`)
  }
  if (missingPoses.size > 0) {
    bits.push(`Diese Pose fehlt noch: ${[...missingPoses].join(', ')}`)
  }
  if (bgMissing) bits.push('Der Hintergrund fehlt in der Bibliothek')
  return `${bits.join('. ')}. Das Standbild entsteht trotzdem. Für gleiche Gesichter und Orte: in der Bibliothek zeichnen.`
}

const FILM_STILL_LANGUAGE_EN: Record<string, string> = {
  de: 'German',
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  ja: 'Japanese',
  zh: 'Chinese',
  ar: 'Arabic',
  fa: 'Persian/Dari',
  ru: 'Russian',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  el: 'Greek',
  cs: 'Czech',
  hu: 'Hungarian',
  ko: 'Korean',
}

/** Sprache für sichtbaren Text im Bild (Schilder, Prospekt, Stand). */
export function filmStillLanguageEn(code?: string): string {
  if (!code?.trim()) return 'the film target language'
  return FILM_STILL_LANGUAGE_EN[code.trim().slice(0, 2).toLowerCase()] ?? code.trim()
}

/**
 * Vollständiger Raum + vollständige Figuren. Kein voriges Standbild —
 * sonst kopiert die KI dasselbe Wohnzimmer zehnmal.
 */
export function sceneWidePanel(
  board: FilmStoryboard,
  panel: FilmStoryboardPanel,
): FilmStoryboardPanel | undefined {
  return board.panels.find(
    (p) =>
      p.sceneId === panel.sceneId &&
      p.id !== panel.id &&
      (p.shot ?? 'wide') !== 'closeup' &&
      Boolean(p.stillUrl?.startsWith('http')),
  )
}

export function sceneWideStillUrl(
  board: FilmStoryboard,
  panel: FilmStoryboardPanel,
): string | undefined {
  return sceneWidePanel(board, panel)?.stillUrl
}

/** Erstes Weit-Bild der Szene — das Grundbild (Raum + wer wo sitzt). */
export function sceneGrundbildPanel(
  board: FilmStoryboard,
  sceneId: string,
): FilmStoryboardPanel | undefined {
  return panelsForScene(board, sceneId).find(
    (p) => (p.shot ?? 'wide') !== 'closeup' && Boolean(p.stillUrl?.startsWith('http')),
  )
}

export function replaceStillUrl(
  board: FilmStoryboard,
  fromUrl: string,
  toUrl: string,
  sceneId?: string,
): FilmStoryboard {
  if (!fromUrl || fromUrl === toUrl) return normalizeFilmStoryboard(board)
  const next = normalizeFilmStoryboard(board)
  return {
    ...next,
    panels: next.panels.map((p) => {
      if (sceneId && p.sceneId !== sceneId) return p
      if (p.stillUrl !== fromUrl) return p
      return { ...p, stillUrl: toUrl, stillError: undefined }
    }),
    updatedAt: new Date().toISOString(),
  }
}

const SIDE_DE: Record<ReturnType<typeof seatSideFromX>, string> = {
  left: 'links',
  center: 'in der Mitte',
  right: 'rechts',
}

function isSittingPlacement(pl: Pick<FilmPlacement, 'poseId' | 'poseHint'>): boolean {
  return pl.poseId === 'sitting' || /sit/i.test(pl.poseHint || '')
}

/** Sitzplan für die KI: wer bleibt wo am Tisch. */
export function seatingLockEn(
  placements: Array<Pick<FilmPlacement, 'name' | 'x' | 'poseId' | 'poseHint'>>,
): string {
  const people = placements.filter((pl) => pl.name.trim())
  if (people.length === 0) return ''
  const bits = people.map((pl) => {
    const side = seatSideFromX(pl.x)
    return `${pl.name} ${isSittingPlacement(pl) ? 'sits' : 'stands'} on the ${side}`
  })
  return (
    `SEATING LOCK (180-degree rule): ${bits.join('; ')}. ` +
    `Everyone stays in that seat at this table unless the director fix explicitly stands them up. ` +
    `Do not move someone to a new room, a studio, or an empty chair. ` +
    `What is behind each person (wall, kitchen, window, table edge) stays as in the attached room photo.`
  )
}

export function seatingNoteDe(
  placements: Array<Pick<FilmPlacement, 'name' | 'x' | 'poseId' | 'poseHint'>>,
): string | null {
  const people = placements.filter((pl) => pl.name.trim())
  if (people.length === 0) return null
  return people
    .map((pl) => {
      const sit = isSittingPlacement(pl)
      return `${pl.name} ${sit ? 'sitzt' : 'steht'} ${SIDE_DE[seatSideFromX(pl.x)]}`
    })
    .join(', ')
}

export function gazeLockEn(speaker: string, addressee?: string, lookNote?: string): string {
  const who = speaker.trim() || 'the speaker'
  const to = addressee?.trim()
  const look = lookNote?.trim()
  const gaze = to
    ? `${who} looks at ${to} (conversation partner in this gathering), NOT at the camera.`
    : `${who} looks at their conversation partner in this gathering, NOT at the camera.`
  return `GAZE LOCK: ${gaze}${look ? ` Look/lighting: ${look}.` : ''}`
}

export function gazeNoteDe(speaker: string, addressee?: string, lookNote?: string): string | null {
  const who = speaker.trim()
  const to = addressee?.trim()
  const look = lookNote?.trim()
  if (who && to) return `${who} schaut ${to} an${look ? ` — ${look}` : ''}`
  if (look) return look
  return null
}

export function personNamedInCorrection(note: string | undefined, names: string[]): string | undefined {
  const t = (note || '').toLowerCase()
  if (!t) return undefined
  return names.find((n) => n.trim() && t.includes(n.trim().toLowerCase()))
}

export function castIdentityLockEn(opts: {
  names: string[]
  genders: Record<string, 'male' | 'female' | undefined>
  stillCorrection?: string
}): string {
  const names = opts.names.filter(Boolean)
  if (names.length === 0) return ''
  const rewrite = correctionRewritesPerson(opts.stillCorrection)
  const changed = personNamedInCorrection(opts.stillCorrection, names)
  const bits = names.map((name) => {
    const g = opts.genders[name]
    const sex =
      g === 'male' ? 'male' : g === 'female' ? 'female' : 'the same sex as in the attached room photo'
    const changing = rewrite && changed && name.trim().toLowerCase() === changed.trim().toLowerCase()
    return changing
      ? `${name} is ${sex} AFTER the director fix (face/sex may change; they stay the same person in the same seat)`
      : `${name} is ${sex} — same person throughout this scene, same face as in the attached room photo`
  })
  const looks = rewrite
    ? []
    : names
        .map((n) => lookForCharacterName(n)?.identityLock)
        .filter((s): s is string => Boolean(s))
  return `CAST LOCK: ${bits.join('. ')}. ${
    rewrite
      ? 'Only the named person in the director fix may change sex/face. Everyone else stays the same people in the same seats.'
      : 'Keep these exact identities. Do not swap faces.'
  }${looks.length ? ` ${looks.join(' ')}` : ''}`
}

export function sceneContinuityBlock(opts: {
  placements?: Array<Pick<FilmPlacement, 'name' | 'x' | 'poseId' | 'poseHint'>>
  speaker?: string
  addressee?: string
  lookNote?: string
  genders?: Record<string, 'male' | 'female' | undefined>
  stillCorrection?: string
  hasGrundbild?: boolean
}): string {
  const placements = opts.placements ?? []
  const names = [...new Set(placements.map((pl) => pl.name.trim()).filter(Boolean))]
  const ground = opts.hasGrundbild
    ? 'GROUNDBILD: The attached room photo is THIS scene. Same table, same furniture, same people in the same seats. Do not invent a new location.'
    : ''
  return [
    ground,
    seatingLockEn(placements),
    gazeLockEn(opts.speaker || '', opts.addressee, opts.lookNote),
    castIdentityLockEn({
      names,
      genders: opts.genders ?? {},
      stillCorrection: opts.stillCorrection,
    }),
  ]
    .filter(Boolean)
    .join(' ')
}

export function referenceUrlsForPanel(
  panel: FilmStoryboardPanel,
  _previousStillUrl?: string,
  correctFromUrl?: string,
  sceneWideStillUrl?: string,
): string[] {
  const people: string[] = []
  for (const pl of panel.placements) {
    if (pl.imageUrl) people.push(pl.imageUrl)
  }
  const bg =
    panel.background.imageUrl && panel.background.match !== 'missing'
      ? panel.background.imageUrl
      : undefined
  const closeup = panel.shot === 'closeup'
  const http = (u?: string): u is string => Boolean(u && u.startsWith('http'))
  const ordered = (
    correctFromUrl
      ? [correctFromUrl, sceneWideStillUrl]
      : closeup
        ? [sceneWideStillUrl]
        : [bg, ...people]
  ).filter(http)
  return [...new Set(ordered)].slice(0, closeup ? 2 : 4)
}

export function previousStillUrlInScene(
  board: FilmStoryboard,
  panel: FilmStoryboardPanel,
): string | undefined {
  const same = panelsForScene(board, panel.sceneId)
  const idx = same.findIndex((p) => p.id === panel.id)
  for (let i = idx - 1; i >= 0; i--) {
    if (same[i]?.stillUrl) return same[i]!.stillUrl
  }
  return undefined
}

export function applyPanelStill(
  board: FilmStoryboard,
  panelId: string,
  stillUrl: string,
  styleId: string,
): FilmStoryboard {
  const next = normalizeFilmStoryboard(board)
  return {
    ...next,
    panels: next.panels.map((p) =>
      p.id === panelId
        ? {
            ...p,
            stillUrl,
            stillStyleId: styleId,
            stillError: undefined,
            harvestNoteDe: undefined,
          }
        : p,
    ),
    updatedAt: new Date().toISOString(),
  }
}

export function applyPanelStillError(
  board: FilmStoryboard,
  panelId: string,
  stillError: string,
): FilmStoryboard {
  const next = normalizeFilmStoryboard(board)
  return {
    ...next,
    panels: next.panels.map((p) => (p.id === panelId ? { ...p, stillError } : p)),
    updatedAt: new Date().toISOString(),
  }
}

/** «Schöme ist ein Mann» — Gesicht neu, Raum behalten. */
export function correctionRewritesPerson(note?: string): boolean {
  const t = (note || '').toLowerCase()
  if (!t) return false
  return /mann|junge|männlich|frau|mädchen|weiblich|\bman\b|\bboy\b|\bgirl\b|gesicht|andere person|ist ein/.test(
    t,
  )
}

export function genderFromPictureNote(note?: string): 'male' | 'female' | undefined {
  const t = (note || '').toLowerCase()
  if (/mann|junge|männlich|\bboy\b|\bmale\b|kein mädchen/.test(t)) return 'male'
  if (/frau|mädchen|weiblich|\bgirl\b|\bfemale\b/.test(t)) return 'female'
  return undefined
}

/** Vorlage für «Bild neu malen»: bei Geschlechtswechsel die Übersicht, nicht das Mädchen-Porträt. */
export function correctFromUrlForPanel(
  board: FilmStoryboard,
  panel: FilmStoryboardPanel,
  correction?: string,
): string | undefined {
  const note = correction?.trim()
  if (!note) return undefined
  if (correctionRewritesPerson(note)) {
    return sceneGrundbildPanel(board, panel.sceneId)?.stillUrl || panel.stillUrl
  }
  return panel.stillUrl
}

/** Was an den angehängten Fotos steht — Gesicht nicht einfrieren, wenn die Person neu soll. */
export function stillAttachmentInstruction(opts: {
  correctingExisting: boolean
  closeup: boolean
  rewritePerson?: boolean
}): string {
  if (opts.rewritePerson && opts.closeup) {
    return 'Attached photos: FIRST the full WIDE GROUNDBILD of this gathering. Film the same moment from a camera that has walked closer to the speaker. New viewpoint and parallax — not a cropped screenshot or digital zoom of the attached photo. Keep them in that place. Sex and face may change as the director fix says. Do not keep a wrong-gender face.'
  }
  if (opts.rewritePerson) {
    return 'Attached photos: first the GROUNDBILD of this room. Keep that same room, furniture, camera and seating. Everyone stays at this table. Redraw only the named person as the director fix says (sex and face may change). Do not keep a wrong-gender face. Do not copy a girl face onto a boy or a boy face onto a girl. Do not invent a new location.'
  }
  if (opts.correctingExisting) {
    return 'Attached photos: the first photo is the CURRENT still to correct. Keep these EXACT people (face, hair, clothes). Apply only the director fix. If a photo is a place, keep that location.'
  }
  if (opts.closeup) {
    return 'Attached photos: FIRST the full WIDE GROUNDBILD of this gathering. Film the same moment from a camera that has walked closer to the speaker. New viewpoint (face larger, background objects shift with parallax). Do NOT output a cropped screenshot or digital zoom of the attached photo. Same person, same place. Fully drawn opaque eyes. Not a studio, not a cut-out bust.'
  }
  return 'Attached photos: first the EMPTY ROOM matching THIS scene (complete furniture, no people). Then COMPLETE people as full studio figures. Paint them INTO a room that matches the dialogue place — not a leftover generic living room. One coherent picture.'
}

/** Nur Mimik auf einer bestehenden Nahaufnahme — sonst neu filmen, nicht den Ausschnitt behalten. */
export function correctionIsFaceOnly(note?: string): boolean {
  const t = (note || '').toLowerCase()
  if (!t || correctionRewritesPerson(t)) return false
  return /mund|lächel|mimik|augenbrau|lid|facial|weint|freut|zorn|überrascht/.test(t)
}

/** Nahaufnahme = Kamera näher, kein zerschnittener Weit-Shot. */
export function closeupCameraLine(speaker?: string): string {
  const who = speaker?.trim() || 'the speaker'
  return (
    `CAMERA PUSH-IN of ${who}: physically walk the camera closer in the same room. ` +
    `New viewpoint: face larger, same person, background objects shift with parallax as a real camera would ` +
    `(a shelf or window behind them may now fill more of the frame or sit at a slightly different angle). ` +
    `Do NOT output a cropped screenshot, cut-out, or digital zoom of the wide photo. ` +
    `The attached photo is the WIDE GROUNDBILD to film FROM, not the output. Paint a NEW closer shot.`
  )
}

/** Nahaufnahme: gleiches Geschlecht wie Übersicht/Stammbild — nicht aus dem Namen raten. */
export function closeupGenderLine(gender?: 'male' | 'female'): string {
  if (gender === 'male') {
    return 'This speaker is male. Keep a male face — do not redraw as a girl.'
  }
  if (gender === 'female') {
    return 'This speaker is female. Keep a female face — do not redraw as a boy.'
  }
  return 'Keep the same sex as in the wide still and identity plate. Do not guess a different gender from the name. Do not change a boy into a girl or a girl into a boy.'
}

export function buildFilmStillPrompt(opts: {
  caption: string
  imageCue?: string
  settingHint?: string
  expressionHint?: string
  sceneTitle?: string
  styleId?: string
  names?: string[]
  poseHints?: string[]
  hasLibraryRefs: boolean
  targetLanguage?: string
  directorNote?: string
  stillCorrection?: string
  correctingExisting?: boolean
  spokenLine?: string
  beatIndex?: number
  beatTotal?: number
  shot?: 'wide' | 'closeup'
  closeupSpeaker?: string
  speakerGender?: 'male' | 'female'
  speakerX?: number
  continuityEn?: string
}): string {
  const style = getStoryStylePrompt(opts.styleId)
  const styleLabel = getStoryArtStyle(opts.styleId).label
  const people = (opts.names ?? []).filter(Boolean).join(', ')
  const poses = (opts.poseHints ?? []).filter(Boolean).join('; ')
  const langEn = filmStillLanguageEn(opts.targetLanguage)
  const isCloseup = opts.shot === 'closeup'
  const rewritePerson = correctionRewritesPerson(opts.stillCorrection)
  const closeEyes =
    'Eyes fully drawn and opaque: white sclera, colored iris, dark pupil — never translucent, glassy, hollow, see-through, or empty-white.'
  const lock = rewritePerson
    ? `${closeEyes} ${closeupGenderLine(opts.speakerGender)} Keep the same room, the same table and the same seats. The speaker stays sitting with the others. Redraw only that person as the director fix says. Do not keep a wrong-gender face. Do not stand them up or move them to a studio.`
    : opts.hasLibraryRefs
    ? isCloseup
      ? `${STORY_STILLS_LOCK_PROMPT} If a WIDE group photo is attached, CAMERA PUSH-IN: walk the camera closer to THAT person in the gathering — a new camera position, not a cropped screenshot. They stay in the SAME seat at the SAME table in the SAME room (table edge still visible and fairly sharp). Same face, hair, clothes, light, sex. If only an identity plate is attached, paint a close-up of that exact person still in that place. Head and shoulders filling the frame, hair fully visible (not cropped). ${closeEyes} ${closeupGenderLine(opts.speakerGender)} Not a new studio portrait, not a cut-out sprite, not a floating bust, not a full-body studio figure pasted into a sofa, not a blurry studio wash.`
      : `${STORY_STILLS_LOCK_PROMPT} Attached photos are identity plates, not stickers: first an EMPTY ROOM with complete furniture matching the place description (not a generic unused living room); then COMPLETE people. Paint a NEW coherent illustration of those people living INSIDE a room that matches the DIALOGUE setting (cushions, table, carpets as described). Sit them IN the real furniture. Do not copy a previous living room. Do not collage or paste sprites.`
    : isCloseup
      ? `Paint a close-up by zooming into the same person in the same room: face fills the frame, mouth and eyebrows readable, head and shoulders, hair not cropped off. ${closeEyes} ${closeupGenderLine(opts.speakerGender)} Same table/seat still readable. No cut-out, no full body, no studio backdrop.`
      : 'Draw a complete room matching the described place (not a leftover generic living room), with complete furniture and complete people occupying it.'
  const notGerman =
    opts.targetLanguage && opts.targetLanguage.slice(0, 2).toLowerCase() !== 'de'
      ? `Never write German on signs, stalls, posters or paper (no Bratwurst, Glühwein, German menus). Use ${langEn} instead (e.g. French: saucisse, vin chaud).`
      : ''
  const moment =
    opts.beatIndex && opts.beatTotal
      ? `This is moment ${opts.beatIndex} of ${opts.beatTotal}.`
      : opts.beatIndex
        ? `This is moment ${opts.beatIndex} of a sequence.`
        : 'This is one moment in a sequence.'

  return [
    `FINISHED cinematic STILL FRAME for a storyboard. Not a moving film, not animation, not a rough pencil sketch.`,
    isCloseup
      ? `${closeupCameraLine(opts.closeupSpeaker)} Camera at eye level, face large (about 50–70% of the frame), head and shoulders, top of hair inside the frame. Mouth mid-speech, eyebrows readable. ${
          rewritePerson
            ? 'New correct face and sex. Do not keep a wrong-gender face from the attached photo.'
            : 'Same face as in the wide gathering.'
        }`
      : rewritePerson
        ? `WIDE shot of the SAME gathering. Keep this camera, this table and these seats. Apply the director fix to the named person only. Everyone else stays where they are. Sitting people stay sitting, hips on the seat.`
        : `WIDE shot. Paint ONE coherent illustration of a complete room filled with complete furniture matching THIS scene's description, and complete figures. The people belong in the room. Do not reuse a previous unrelated living room. Do not collage, no cut-out sprites, no dashed boxes, no ghost people.`,
    opts.correctingExisting
      ? ''
      : `${moment} It MUST look different from other frames: who speaks, what they hold, gaze, pose or camera. Never copy the previous frame.`,
    `Art style (${styleLabel}): ${style}`,
    opts.continuityEn || '',
    lock,
    isCloseup
      ? closeupSpaceLine({
          speaker: opts.closeupSpeaker || '',
          settingHint: opts.settingHint,
          speakerX: opts.speakerX,
          poseHint: poses,
        })
      : '',
    opts.correctingExisting
      ? correctionRewritesPerson(opts.stillCorrection)
        ? 'An attached photo is the CURRENT GROUNDBILD. Keep the SAME room, furniture, camera and seats. The named person stays at this table. Redraw that speaker as the director fix says (sex and face may change). Do not keep a wrong-gender face. Do not stand them up.'
        : isCloseup
          ? 'An attached photo is the CURRENT close-up of this person. Keep the exact crop, face, hair and clothes. Change ONLY facial muscles (eyebrows, eyelids, mouth, nose wrinkle) as asked. Do not redraw a new portrait.'
          : 'An attached photo is the CURRENT still. Apply the director fix to that frame. Keep faces, clothes and place unless the fix says otherwise.'
      : '',
    `Scene title: ${opts.sceneTitle || 'Scene'}.`,
    `Place: ${opts.settingHint || 'as implied'}.`,
    `Action / caption: ${opts.caption}.`,
    opts.spokenLine ? `Spoken in this moment: ${opts.spokenLine}.` : '',
    opts.imageCue ? `What we see in THIS frame only: ${opts.imageCue}.` : '',
    `Faces: ${opts.expressionHint || 'natural'}.`,
    people ? `People in frame: ${people}.` : '',
    poses ? `Poses: ${poses}.` : '',
    opts.directorNote ? `Director note: ${opts.directorNote}.` : '',
    opts.stillCorrection
      ? `DIRECTOR FIX — change only this: ${opts.stillCorrection}.`
      : '',
    isCloseup
      ? `Widescreen 16:9. Close-up crop of the same gathering. Face large. Hair not cut off at the top. Opaque eyes with iris and pupil. No legs, no floating torso, no studio cut-out, no second person, no glassy see-through eyes.`
      : `Widescreen 16:9. Standing people: full body, both legs and shoes on the floor. Sitting people: hips on the seat, back against the backrest, knees bent. Furniture belongs to the room. Same body scale. No extra limbs.`,
    `VISIBLE IN-WORLD TEXT (shop signs, stall labels, posters, menus, flyers, prospectus, packaging, newspapers) MUST be written in ${langEn} only.`,
    notGerman,
    `Ignore any earlier "NO text" rule for shop signs, stall labels, posters, flyers and prospectus.`,
    `NO speech bubbles, NO subtitles, NO captions, NO UI overlays. In-world print is allowed and must be in ${langEn}.`,
  ]
    .filter(Boolean)
    .join(' ')
}

export function applyPanelHarvestNote(
  board: FilmStoryboard,
  panelId: string,
  harvestNoteDe: string,
): FilmStoryboard {
  const next = normalizeFilmStoryboard(board)
  return {
    ...next,
    panels: next.panels.map((p) => (p.id === panelId ? { ...p, harvestNoteDe } : p)),
    updatedAt: new Date().toISOString(),
  }
}

export function stillTimeoutHintDe(message: string): string {
  if (/zeitlimit|zu lange|timeout|FUNCTION_INVOCATION/i.test(message)) {
    return 'Das hat zu lange gedauert. Die fertigen Bilder bleiben. Noch einmal auf «Diese Szene erzeugen» — es macht nur die fehlenden Bilder.'
  }
  return message
}

