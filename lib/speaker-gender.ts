export function guessSpeakerGenderFromName(
  speaker: string,
  speakerIndex: number,
): 'male' | 'female' {
  const s = speaker.toLowerCase()
  if (
    /\b(ben|max|tom|john|james|paul|mark|hans|peter|mike|david|alex|luke|tim|sam|chris|dan|jun|jin|hyun|joon|ho|seo|minho|taehyung|ramo|reza|ali|hassan|amir|mehdi|kellner|waiter|garçon)\b/.test(
      s,
    )
  )
    return 'male'
  if (
    /\b(anna|maria|sarah|lisa|emma|julia|sophie|elena|kate|amy|linda|laura|nina|sara|yuna|hee|su|young|mi|shome|zahra|maryam|fatemeh|kellnerin|soojin|mina)\b/.test(
      s,
    )
  )
    return 'female'
  return speakerIndex % 2 === 0 ? 'female' : 'male'
}
