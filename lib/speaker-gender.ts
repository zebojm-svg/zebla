function foldSpeakerName(speaker: string): string {
  return speaker
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ß/g, 'ss')
}

export function guessSpeakerGenderFromName(
  speaker: string,
  speakerIndex: number,
): 'male' | 'female' {
  const fold = foldSpeakerName(speaker)
  if (
    /\b(ben|max|tom|john|james|paul|mark|hans|peter|mike|david|alex|luke|tim|sam|chris|dan|jun|jin|hyun|joon|ho|seo|minho|taehyung|ramo|reza|ali|hassan|amir|mehdi|khan|ubai|schome|schoeme|shome|kellner|waiter|garcon)\b/.test(
      fold,
    )
  )
    return 'male'
  if (
    /\b(anna|maria|sarah|lisa|emma|julia|sophie|elena|kate|amy|linda|laura|nina|sara|yuna|hee|su|young|mi|zahra|maryam|fatemeh|kellnerin|soojin|mina)\b/.test(
      fold,
    )
  )
    return 'female'
  return speakerIndex % 2 === 0 ? 'female' : 'male'
}
