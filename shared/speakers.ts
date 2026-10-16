import {
  inferDialogLineKind,
  isNarratorName,
  isStageSpeaker,
  type Dialog,
  type DialogLine,
} from './types.js'

/** Schöme = Schoeme, Erzähler = Erzaehler — für Stimmen und Bilder. */
export function foldSpeakerName(speaker: string): string {
  return speaker
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ß/g, 'ss')
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u')
}

export function canonicalSpeakerName(speaker: string): string {
  const t = speaker.trim()
  if (!t) return ''
  if (isNarratorName(t)) return 'Erzähler'
  return t
}

export function matchSpeakerName(a: string, b: string): boolean {
  return foldSpeakerName(canonicalSpeakerName(a)) === foldSpeakerName(canonicalSpeakerName(b))
}

export function matchSpeakerKey(
  records: Record<string, unknown> | undefined,
  speaker: string,
): string | undefined {
  if (!records) return undefined
  if (Object.prototype.hasOwnProperty.call(records, speaker)) return speaker
  const want = foldSpeakerName(canonicalSpeakerName(speaker))
  if (!want) return undefined
  return Object.keys(records).find((k) => foldSpeakerName(canonicalSpeakerName(k)) === want)
}

export function lookupSpeakerRecord<T>(
  records: Record<string, T> | undefined,
  speaker: string,
): T | undefined {
  const key = matchSpeakerKey(records, speaker)
  return key ? records?.[key] : undefined
}

const MALE_NAMES =
  /\b(ben|max|tom|john|james|paul|mark|hans|peter|mike|david|alex|luke|tim|sam|chris|dan|jun|jin|hyun|joon|ho|seo|minho|taehyung|ramo|reza|ali|hassan|amir|mehdi|khan|ubai|ubaid|schome|schoeme|shome|kellner|waiter|garcon)\b/
const FEMALE_NAMES =
  /\b(anna|maria|sarah|lisa|emma|julia|sophie|elena|kate|amy|linda|laura|nina|sara|yuna|hee|su|young|mi|zahra|maryam|fatemeh|kellnerin|soojin|mina)\b/

/** Nur bekannte Namen — für Bilder und Stimmen, ohne geratenes gerade/ungerade. */
export function genderFromKnownName(speaker: string): 'male' | 'female' | undefined {
  const fold = foldSpeakerName(speaker)
  if (MALE_NAMES.test(fold)) return 'male'
  if (FEMALE_NAMES.test(fold)) return 'female'
  return undefined
}

export function guessSpeakerGenderFromName(
  speaker: string,
  _speakerIndex: number,
): 'male' | 'female' {
  return genderFromKnownName(speaker) ?? 'male'
}

export function spokenSpeakerName(
  line: Pick<Dialog['sections'][number]['lines'][number], 'kind' | 'speaker' | 'text' | 'cueImage'>,
): string | undefined {
  const kind = inferDialogLineKind(line)
  if (kind === 'action') return undefined
  if (kind === 'narrator') {
    const name = canonicalSpeakerName(line.speaker)
    return name && !isStageSpeaker(name) ? name : 'Erzähler'
  }
  const name = canonicalSpeakerName(line.speaker)
  if (!name || isStageSpeaker(name)) return undefined
  return name
}

export function lineBelongsToSpeaker(
  line: Pick<Dialog['sections'][number]['lines'][number], 'kind' | 'speaker' | 'text' | 'cueImage'>,
  speaker: string,
): boolean {
  const name = spokenSpeakerName(line)
  return Boolean(name && matchSpeakerName(name, speaker))
}

export function uniqueSpeakersInDialog(dialog: Dialog): string[] {
  const order: string[] = []
  const seen = new Set<string>()
  for (const section of dialog.sections) {
    for (const line of section.lines) {
      const name = spokenSpeakerName(line)
      if (!name) continue
      const fold = foldSpeakerName(name)
      if (!seen.has(fold)) {
        seen.add(fold)
        order.push(name)
      }
    }
  }
  return order
}

/** Sprecher-Menü am Bild-Päckchen — plus Erzähler und Namen aus dem Bild. */
export function packSpeakerChoices(
  dialog: Dialog,
  extraNames: string[] = [],
): string[] {
  const order: string[] = []
  const seen = new Set<string>()
  const add = (raw?: string) => {
    const name = canonicalSpeakerName(raw || '')
    if (!name || isStageSpeaker(name)) return
    const fold = foldSpeakerName(name)
    if (seen.has(fold)) return
    seen.add(fold)
    order.push(name)
  }
  for (const name of uniqueSpeakersInDialog(dialog)) add(name)
  add('Erzähler')
  for (const name of extraNames) add(name)
  return order
}

/** Sprecher setzen oder leeren (stumm = Handlung, kein Audio). */
export function applyLineSpeaker(line: DialogLine, speaker: string): DialogLine {
  const name = speaker.trim()
  if (!name) {
    return { ...line, speaker: '', kind: 'action', audioUrl: undefined, birkenbihl: undefined }
  }
  if (isNarratorName(name)) {
    return { ...line, speaker: 'Erzähler', kind: 'narrator', audioUrl: undefined }
  }
  return { ...line, speaker: name, kind: 'speech', audioUrl: undefined }
}

export function speakerGender(
  dialog: Dialog,
  speaker: string,
): 'male' | 'female' | undefined {
  const known = genderFromKnownName(speaker)
  if (known) return known
  return (
    lookupSpeakerRecord(dialog.speakerProfiles, speaker)?.gender ??
    dialog.characterBible?.find((c) => matchSpeakerName(c.name, speaker))?.gender ??
    lookupSpeakerRecord(dialog.speakerVoices, speaker)?.gender
  )
}
