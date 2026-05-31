export function guessSpeakerGenderFromName(
  speaker: string,
  speakerIndex: number,
): 'male' | 'female' {
  const s = speaker.toLowerCase()
  if (
    /\b(ben|max|tom|john|james|paul|mark|hans|peter|mike|david|alex|luke|tim|sam|chris|dan|min|jun|jin|hyun|joon|ho|seo|kellner|waiter|garçon)\b/.test(
      s,
    )
  )
    return 'male'
  if (
    /\b(anna|maria|sarah|lisa|emma|julia|sophie|elena|kate|amy|linda|laura|nina|sara|ji|yuna|min|hee|su|young|mi|kellnerin)\b/.test(
      s,
    )
  )
    return 'female'
  return speakerIndex % 2 === 0 ? 'female' : 'male'
}
