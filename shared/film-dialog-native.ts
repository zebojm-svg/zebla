/**
 * Dialog zuerst in der Muttersprache, Zielsprache erst auf Knopf.
 * text = Zielsprache (leer bis «Zielsprache machen»).
 * nativeText = Muttersprache (meist Deutsch).
 * Regie-Notizen bleiben Deutsch.
 */

import { inferDialogLineKind, type Dialog, type DialogLine, type DialogSection } from './types.js'
import type { BirkenbihlWord } from './types.js'

export function lineStoryText(
  line: Pick<DialogLine, 'text' | 'nativeText' | 'kind' | 'speaker' | 'cueImage'>,
): string {
  const kind = inferDialogLineKind(line)
  if (kind === 'action') return (line.text || line.nativeText || '').trim()
  return (line.nativeText || line.text || '').trim()
}

export function lineHasTargetSpeech(
  line: Pick<DialogLine, 'text' | 'kind' | 'speaker' | 'cueImage'>,
): boolean {
  if (inferDialogLineKind(line) === 'action') return false
  return Boolean(line.text?.trim())
}

export function dialogNeedsTargetTranslation(dialog: Pick<Dialog, 'sections'>): boolean {
  return dialog.sections.some((s) =>
    s.lines.some((l) => {
      if (inferDialogLineKind(l) === 'action') return false
      return Boolean(lineStoryText(l)) && !lineHasTargetSpeech(l)
    }),
  )
}

/** Gesprochene Zeile in die Muttersprache legen, Zielsprache leeren. Handlung bleibt Deutsch. */
export function applyNativeFirstDraftLine(line: DialogLine): DialogLine {
  const kind = inferDialogLineKind(line)
  const spoken = (line.nativeText || line.text || '').trim()
  const cues = {
    cueImage: line.cueImage,
    cueSound: line.cueSound,
    cueSpeech: line.cueSpeech,
  }
  if (kind === 'action') {
    return {
      ...line,
      kind,
      text: spoken,
      nativeText: spoken || line.nativeText,
      birkenbihl: undefined,
      ...cues,
    }
  }
  return {
    ...line,
    kind,
    nativeText: spoken || undefined,
    text: '',
    birkenbihl: undefined,
    audioUrl: undefined,
    ...cues,
  }
}

export function applyNativeFirstDraftSections(sections: DialogSection[]): DialogSection[] {
  return sections.map((sec) => ({
    ...sec,
    lines: sec.lines.map(applyNativeFirstDraftLine).filter((l) => lineStoryText(l)),
  }))
}

/** Zielsprache eintragen — Muttersprache und Regie bleiben. */
export function applyTargetTranslationToLine(
  line: DialogLine,
  targetText: string,
  birkenbihl?: BirkenbihlWord[],
): DialogLine {
  const kind = inferDialogLineKind(line)
  const native = (line.nativeText || line.text || '').trim()
  if (kind === 'action') {
    return {
      ...line,
      text: native,
      nativeText: native || undefined,
      cueImage: line.cueImage,
      cueSound: line.cueSound,
      cueSpeech: line.cueSpeech,
    }
  }
  const spoken = targetText.trim()
  return {
    ...line,
    nativeText: native || undefined,
    text: spoken,
    birkenbihl: birkenbihl?.length ? birkenbihl : undefined,
    audioUrl: undefined,
    cueImage: line.cueImage,
    cueSound: line.cueSound,
    cueSpeech: line.cueSpeech,
  }
}

export function directorNotesStayGerman(line: Pick<DialogLine, 'cueImage' | 'cueSound' | 'cueSpeech'>): {
  cueImage?: string
  cueSound?: string
  cueSpeech?: string
} {
  return {
    cueImage: line.cueImage,
    cueSound: line.cueSound,
    cueSpeech: line.cueSpeech,
  }
}

export function alignCueImageWithStillFix(cueImage: string | undefined, correction?: string): string {
  const cue = (cueImage || '').trim()
  const fix = (correction || '').trim()
  if (!fix) return cue
  if (!cue) return fix
  if (cue.toLowerCase().includes(fix.toLowerCase())) return cue
  return `${cue}. Geändert: ${fix}`
}

export function alignDialogLineCueAfterStill(
  sections: DialogSection[],
  lineId: string | undefined,
  correction?: string,
): DialogSection[] {
  const id = lineId?.trim()
  const fix = (correction || '').trim()
  if (!id || !fix) return sections
  return sections.map((sec) => ({
    ...sec,
    lines: sec.lines.map((line) =>
      line.id === id ? { ...line, cueImage: alignCueImageWithStillFix(line.cueImage, fix) } : line,
    ),
  }))
}
