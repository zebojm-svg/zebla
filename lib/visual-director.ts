import type {
  Dialog,
  VisualArtStyle,
  VisualBrief,
  VisualCameraLanguage,
  VisualQuestion,
} from '../shared/types.js'
import { imagePlanningContext } from '../shared/dialog-image-context.js'
import { appearanceGuideFor, styleLockPrompt } from './ken-burns-style.js'

type ChatJsonFn = <T>(system: string, user: string) => Promise<T>

export const VISUAL_QUESTIONS: VisualQuestion[] = [
  {
    id: 'style',
    question: 'In welchem Stil sollen die Bilder sein?',
    options: [
      { id: 'photoreal', label: 'Echte Menschen (wie ein Foto)' },
      { id: 'illustration', label: 'Kinderbuch-Zeichnung' },
      { id: 'comic', label: 'Comic' },
      { id: 'watercolor', label: 'Aquarell' },
    ],
  },
  {
    id: 'age',
    question: 'Wie alt sind die Figuren?',
    options: [
      { id: 'children', label: 'Kinder (ca. 8–12 Jahre)' },
      { id: 'teens', label: 'Jugendliche (ca. 13–16 Jahre)' },
      { id: 'adults', label: 'Erwachsene' },
    ],
  },
  {
    id: 'camera',
    question: 'Wie sollen die Bilder erzählen?',
    options: [
      {
        id: 'picture_story',
        label:
          'Bildergeschichte: manchmal die Personen, manchmal nah auf den Gegenstand (Prospekt, Gerät …)',
      },
      {
        id: 'dialog_coverage',
        label: 'Gespräch: vor allem Gesichter, wie im Film',
      },
    ],
  },
]

const ART_STYLES = new Set<VisualArtStyle>([
  'photoreal',
  'illustration',
  'comic',
  'watercolor',
])

function inferArtStyle(text: string): VisualArtStyle | null {
  const t = text.toLowerCase()
  if (/(aquarell|watercolor)/.test(t)) return 'watercolor'
  if (/\bcomic\b|graphic novel/.test(t)) return 'comic'
  if (
    /(kinderbuch|zeichnung|illustration|gezeichnet|storybook|ink line|bookbox)/.test(
      t,
    )
  ) {
    return 'illustration'
  }
  if (/(fotorealist|photoreal|echte menschen|live-action|wie ein foto)/.test(t)) {
    return 'photoreal'
  }
  return null
}

function inferAgeKey(text: string): 'children' | 'teens' | 'adults' | null {
  const t = text.toLowerCase()
  if (/(jugendliche|teenager|15[- ]?j|14[- ]?j|16[- ]?j|schüler|sekundar)/.test(t)) {
    return 'teens'
  }
  if (/(kind\b|kinder|8[- ]?j|10[- ]?j|12[- ]?j)/.test(t)) return 'children'
  if (/(erwachsen|adult|20[- ]?j|30[- ]?j)/.test(t)) return 'adults'
  return null
}

function inferCamera(text: string): VisualCameraLanguage | null {
  const t = text.toLowerCase()
  if (
    /(bildergeschichte|prospekt|nahaufnahme|hinein|bookbox|insert|gegenstand zoomen)/.test(
      t,
    )
  ) {
    return 'picture_story'
  }
  if (/(gespräch|gesichter|film|schulterkamera|over-the-shoulder)/.test(t)) {
    return 'dialog_coverage'
  }
  return null
}

function ageEnFromKey(key: string | undefined): string {
  if (key === 'children') return 'children about 8–12 years old'
  if (key === 'teens') return 'teenagers about 13–16 years old, not adults'
  if (key === 'adults') return 'young adults'
  return 'ages matching the story, not older than implied'
}

export function neededVisualQuestions(
  dialog: Dialog,
  answers?: Record<string, string>,
): VisualQuestion[] {
  const blob = `${dialog.imageDirection ?? ''}\n${dialog.creationPrompt ?? ''}`
  const merged = { ...(dialog.visualBrief?.answers ?? {}), ...(answers ?? {}) }
  const missing: VisualQuestion[] = []
  for (const q of VISUAL_QUESTIONS) {
    if (merged[q.id]) continue
    if (q.id === 'style' && inferArtStyle(blob)) continue
    if (q.id === 'age' && inferAgeKey(blob)) continue
    if (q.id === 'camera' && inferCamera(blob)) continue
    missing.push(q)
  }
  return missing
}

function resolveAnswers(
  dialog: Dialog,
  answers?: Record<string, string>,
): Record<string, string> {
  const blob = `${dialog.imageDirection ?? ''}\n${dialog.creationPrompt ?? ''}`
  const merged = { ...(dialog.visualBrief?.answers ?? {}), ...(answers ?? {}) }
  if (!merged.style) {
    const inferred = inferArtStyle(blob)
    if (inferred) merged.style = inferred
  }
  if (!merged.age) {
    const inferred = inferAgeKey(blob)
    if (inferred) merged.age = inferred
  }
  if (!merged.camera) {
    const inferred = inferCamera(blob)
    if (inferred) merged.camera = inferred
  }
  return merged
}

export async function buildVisualBrief(
  dialog: Dialog,
  chatJson: ChatJsonFn,
  answers?: Record<string, string>,
): Promise<VisualBrief> {
  const merged = resolveAnswers(dialog, answers)
  const artStyle = ART_STYLES.has(merged.style as VisualArtStyle)
    ? (merged.style as VisualArtStyle)
    : 'photoreal'
  const cameraLanguage: VisualCameraLanguage =
    merged.camera === 'picture_story' ? 'picture_story' : 'dialog_coverage'
  const ageEn = ageEnFromKey(merged.age)
  const stylePromptEn = styleLockPrompt(artStyle)
  const castLockEn = appearanceGuideFor(artStyle, ageEn)
  const imageContext = imagePlanningContext(dialog)
  const lines = dialog.sections.flatMap((s, si) =>
    s.lines.map((l, li) => ({
      globalLineIndex:
        dialog.sections.slice(0, si).reduce((n, x) => n + x.lines.length, 0) + li,
      speaker: l.speaker,
      text: l.text,
    })),
  )

  const result = await chatJson<{
    settingEn: string
    mustShowEn: string[]
    insertPlan: { globalLineIndex: number; whatEn: string }[]
    directorPromptEn: string
    distinctCastEn: string
  }>(
    `Du bist Bild-Regie für eine Sprachlern-Diashow. Aus den groben Nutzer-Hinweisen machst du einen FESTEN Zwischen-Prompt für die Bild-KI.

Bekannte Fehler, die du VERMEIDEN musst:
- Nutzer will Zeichnung/Jugendliche/Prospekt, KI liefert trotzdem Foto-Erwachsene und 20× Schulterkamera.
- Gegenstand, über den gesprochen wird (Prospekt, Roboter, Zahnpasta …), ist unsichtbar.
- Beide Figuren tragen dieselbe Kleidung oder tauschen Brille/Bart.
- Alle Gesichter sind «neutral freundlich», obwohl der Text lacht, zweifelt oder spottet.
- Eine geplante Nahaufnahme (Insert) wird nie benutzt.

Regeln:
- artStyle ist ${artStyle}. Age: ${ageEn}. Kamera: ${cameraLanguage}.
- settingEn: ein fester Ort (englisch).
- mustShowEn: Dinge, die in Zimmershots SICHTBAR sein müssen (z.B. open advertising brochure).
- insertPlan: bei Bildergeschichte für wichtige Gegenstände Nahaufnahmen (globalLineIndex + whatEn). Mindestens 3 Inserts wenn der Dialog Gegenstände nennt. Bei dialog_coverage darf insertPlan leer sein.
- distinctCastEn: pro Sprecher eine kurze englische Unterscheidung (Haare, KleidungsFARBE, Brille ja/nein). Keine Erwachsenen, wenn Age Teenager/Kinder ist.
- directorPromptEn: 8–14 englische Sätze. Das ist der Zwischen-Prompt. Er lockt Stil, Alter, Ort, Pflicht-Requisiten, wann Insert vs. Two-Shot, Mimik folgt dem Text, keine Schrift im Bild.

JSON only.`,
    `${imageContext ? `${imageContext}\n\n---\n` : ''}Titel: ${dialog.title}\nSprecher-Profile: ${JSON.stringify(dialog.speakerProfiles ?? {})}\nZeilen:\n${JSON.stringify(lines)}`,
  )

  const directorPromptEn = [
    result.directorPromptEn?.trim(),
    stylePromptEn,
    `LOCKED AGE: ${ageEn}.`,
    `LOCKED SETTING: ${result.settingEn}.`,
    result.distinctCastEn ? `DISTINCT CAST: ${result.distinctCastEn}` : '',
    result.mustShowEn?.length
      ? `MUST BE VISIBLE IN ROOM SHOTS: ${result.mustShowEn.join('; ')}.`
      : '',
    cameraLanguage === 'picture_story'
      ? 'CAMERA LANGUAGE: picture story. Alternate two-shots of BOTH people AND close-up inserts of the object they talk about. Do not use 20 identical over-the-shoulder talking heads. People often look at the object, not only at each other.'
      : 'CAMERA LANGUAGE: dialog coverage. Over-the-shoulder of the speaker is allowed, but the key prop still appears when the line names it.',
    dialog.visualBrief?.extraConstraintsEn
      ? `USER CORRECTIONS: ${dialog.visualBrief.extraConstraintsEn}`
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  return {
    version: 1,
    artStyle,
    cameraLanguage,
    stylePromptEn,
    ageEn,
    settingEn: result.settingEn?.trim() || 'a simple interior matching the story',
    castLockEn: `${castLockEn} ${result.distinctCastEn ?? ''}`.trim(),
    mustShowEn: Array.isArray(result.mustShowEn) ? result.mustShowEn.filter(Boolean) : [],
    insertPlan: Array.isArray(result.insertPlan)
      ? result.insertPlan.filter(
          (p) =>
            Number.isFinite(p.globalLineIndex) &&
            p.globalLineIndex >= 0 &&
            p.whatEn?.trim(),
        )
      : [],
    directorPromptEn,
    answers: merged,
    testImageUrl: dialog.visualBrief?.testImageUrl,
    testApproved: dialog.visualBrief?.testApproved,
    extraConstraintsEn: dialog.visualBrief?.extraConstraintsEn,
    criticNotesEn: dialog.visualBrief?.criticNotesEn,
  }
}

export function testImagePrompt(dialog: Dialog, bibleNote?: string): string {
  const brief = dialog.visualBrief
  const speakers = [...new Set(dialog.sections.flatMap((s) => s.lines.map((l) => l.speaker)))]
  return (
    `TEST / MASTER FRAME for a language-learning picture story. ` +
    `${brief?.directorPromptEn ?? ''} ` +
    `Show ${speakers.join(' and ')} together in ${brief?.settingEn ?? 'the main setting'}, clearly recognizable, ` +
    `looking at the main prop of the story if there is one. ` +
    `${bibleNote ? `CAST: ${bibleNote}. ` : ''}` +
    `${brief?.castLockEn ?? ''} ` +
    `${brief?.stylePromptEn ?? ''} ` +
    `No text in the image. This frame is the visual standard for all later pictures.`
  )
}
