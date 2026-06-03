import type { Dialog } from './types.js'

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
  return (
    dialog.speakerProfiles?.[speaker]?.gender ??
    dialog.characterBible?.find((c) => c.name === speaker)?.gender
  )
}
