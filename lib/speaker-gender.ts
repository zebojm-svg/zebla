function foldSpeakerName(speaker: string): string {
  return speaker
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ß/g, 'ss')
}

const MALE_NAMES =
  /\b(ben|max|tom|john|james|paul|mark|hans|peter|mike|david|alex|luke|tim|sam|chris|dan|jun|jin|hyun|joon|ho|seo|minho|taehyung|ramo|reza|ali|hassan|amir|mehdi|khan|ubai|schome|schoeme|shome|kellner|waiter|garcon)\b/
const FEMALE_NAMES =
  /\b(anna|maria|sarah|lisa|emma|julia|sophie|elena|kate|amy|linda|laura|nina|sara|yuna|hee|su|young|mi|zahra|maryam|fatemeh|kellnerin|soojin|mina)\b/

/** Nur bekannte Namen — für Bilder, ohne geratenes gerade/ungerade. */
export function genderFromKnownName(speaker: string): 'male' | 'female' | undefined {
  const fold = foldSpeakerName(speaker)
  if (MALE_NAMES.test(fold)) return 'male'
  if (FEMALE_NAMES.test(fold)) return 'female'
  return undefined
}

export function guessSpeakerGenderFromName(
  speaker: string,
  speakerIndex: number,
): 'male' | 'female' {
  return genderFromKnownName(speaker) ?? (speakerIndex % 2 === 0 ? 'female' : 'male')
}
