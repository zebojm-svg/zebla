import type { Dialog } from './types.js'

function foldSpeakerName(speaker: string): string {
  return speaker
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ß/g, 'ss')
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

export function uniqueSpeakersInDialog(dialog: Dialog): string[] {
  const order: string[] = []
  const seen = new Set<string>()
  for (const section of dialog.sections) {
    for (const line of section.lines) {
      if (!seen.has(line.speaker)) {
        seen.add(line.speaker)
        order.push(line.speaker)
      }
    }
  }
  return order
}

export function speakerGender(
  dialog: Dialog,
  speaker: string,
): 'male' | 'female' | undefined {
  const known = genderFromKnownName(speaker)
  if (known) return known
  return (
    dialog.speakerProfiles?.[speaker]?.gender ??
    dialog.characterBible?.find((c) => c.name === speaker)?.gender ??
    dialog.speakerVoices?.[speaker]?.gender
  )
}
