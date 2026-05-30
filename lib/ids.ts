import { randomUUID } from 'crypto'
import type { DialogLine } from '../shared/types.js'

export function newLineId(): string {
  return randomUUID()
}

export function linesFromRaw(
  lines: { speaker: string; text: string }[],
): DialogLine[] {
  return lines.map((l) => ({
    id: newLineId(),
    speaker: l.speaker,
    text: l.text,
  }))
}
