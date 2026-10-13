/**
 * Dialog zuerst in der Muttersprache, Zielsprache erst auf Knopf.
 * text = Zielsprache (leer bis «Zielsprache machen»).
 * nativeText = Muttersprache (meist Deutsch).
 * Regie-Notizen bleiben Deutsch.
 */

import {
  inferDialogLineKind,
  isRtlLanguage,
  needsRomanization,
  type Dialog,
  type DialogLine,
  type DialogSection,
} from './types.js'
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

const GERMAN_WORD_RE =
  /\b(der|die|das|den|dem|des|und|ist|hat|ein|eine|einen|einem|einer|nicht|ich|du|er|sie|es|wir|ihr|sich|auf|mit|von|zu|im|am|ins|ans|dass|wie|auch|nach|bei|aus|oder|aber|wenn|weil|als|noch|nur|schon|bitte|willkommen|eingeladen|freunde|setz|setzt|dich|euch|kessel|tee|ramo|willkommen)\b/i

/** Lateinischer Satz, der noch Deutsch ist — nicht die Zielsprache. */
export function looksLikeGerman(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/[^\u0000-\u024F]/.test(t)) return false
  if (/[äöüÄÖÜß]/.test(t)) return true
  return GERMAN_WORD_RE.test(t)
}

/**
 * Gesprochener Slot sieht noch nach Muttersprache aus (Deutsch in `text`,
 * oder Latein obwohl die Zielsprache Persisch/Arabisch/… braucht).
 */
export function spokenLooksLikeSourceLanguage(
  spoken: string,
  sourceLanguage?: string,
  targetLanguage?: string,
): boolean {
  const text = spoken.trim()
  if (!text) return false
  const src = (sourceLanguage || 'de').slice(0, 2).toLowerCase()
  const tgt = (targetLanguage || '').slice(0, 2).toLowerCase()
  if (tgt && src === tgt) return false
  const hasNonLatin = /[^\u0000-\u024F]/.test(text)
  if (tgt && (isRtlLanguage(tgt) || needsRomanization(tgt)) && !hasNonLatin) return true
  if (src === 'de') return looksLikeGerman(text)
  return false
}

function langPairIsSame(sourceLanguage?: string, targetLanguage?: string): boolean {
  const src = (sourceLanguage || 'de').slice(0, 2).toLowerCase()
  const tgt = (targetLanguage || '').slice(0, 2).toLowerCase()
  return Boolean(tgt) && src === tgt
}

/** Normale Muttersprache — nie die Birkenbihl-Wortfolge. */
export function lineGermanText(
  line: Pick<DialogLine, 'text' | 'nativeText' | 'kind' | 'speaker' | 'cueImage' | 'birkenbihl'>,
  targetLanguage?: string,
  sourceLanguage?: string,
): string {
  if (inferDialogLineKind(line) === 'action') return (line.nativeText || line.text || '').trim()
  const native = line.nativeText?.trim()
  if (native) return native
  const spoken = (line.text || '').trim()
  if (!spoken) return ''
  if (lineNeedsTargetTranslation(line, targetLanguage, sourceLanguage)) return spoken
  return ''
}

/** Zielsprache (z. B. Persisch) — leer bis «Zielsprache machen», Handlung nie. */
export function lineTargetText(
  line: Pick<DialogLine, 'text' | 'nativeText' | 'birkenbihl' | 'kind' | 'speaker' | 'cueImage'>,
  targetLanguage?: string,
  sourceLanguage?: string,
): string {
  if (inferDialogLineKind(line) === 'action') return ''
  if (lineNeedsTargetTranslation(line, targetLanguage, sourceLanguage)) return ''
  return (line.text || '').trim()
}

export function lineBirkenbihlWords(
  line: Pick<DialogLine, 'birkenbihl'>,
): BirkenbihlWord[] {
  return line.birkenbihl?.length ? line.birkenbihl : []
}

export function lineRomanizationText(line: Pick<DialogLine, 'birkenbihl'>): string {
  return lineBirkenbihlWords(line)
    .map((w) => w.romanization?.trim())
    .filter(Boolean)
    .join(' ')
}

/** Deutscher Satz, aus dem «Zielsprache machen» übersetzt (nativeText oder noch text). */
export function lineNativeSourceForTarget(
  line: Pick<DialogLine, 'text' | 'nativeText' | 'kind' | 'speaker' | 'cueImage'>,
): string {
  if (inferDialogLineKind(line) === 'action') return ''
  return (line.nativeText || line.text || '').trim()
}

/**
 * Gesprochene Zeile hat Deutsch, aber noch keine echte Zielsprache.
 * Deutsch darf in nativeText ODER in text stehen — text === Deutsch zählt nicht als Ziel.
 * Alte Filme mit Persisch/Arabisch in text und ohne Deutsch: nicht hier, sondern «Deutsch unter die Zeilen».
 */
export function lineNeedsTargetTranslation(
  line: Pick<DialogLine, 'text' | 'nativeText' | 'birkenbihl' | 'kind' | 'speaker' | 'cueImage'>,
  targetLanguage?: string,
  sourceLanguage?: string,
): boolean {
  if (inferDialogLineKind(line) === 'action') return false
  if (langPairIsSame(sourceLanguage, targetLanguage)) return false
  const native = (line.nativeText || '').trim()
  const spoken = (line.text || '').trim()
  const source = native || spoken
  if (!source) return false
  if (
    spoken &&
    spoken !== native &&
    spoken !== source &&
    !spokenLooksLikeSourceLanguage(spoken, sourceLanguage, targetLanguage)
  ) {
    return false
  }
  if (!spoken || spoken === native || spokenLooksLikeSourceLanguage(spoken, sourceLanguage, targetLanguage)) {
    return true
  }
  return false
}

export function dialogNeedsTargetTranslation(
  dialog: Pick<Dialog, 'sections'> & { targetLanguage?: string; sourceLanguage?: string },
): boolean {
  return dialog.sections.some((s) =>
    s.lines.some((l) =>
      lineNeedsTargetTranslation(l, dialog.targetLanguage, dialog.sourceLanguage),
    ),
  )
}

export function countFilledTargetSpeech(
  lines: Array<Pick<DialogLine, 'text' | 'nativeText' | 'birkenbihl' | 'kind' | 'speaker' | 'cueImage'>>,
  targetLanguage?: string,
  sourceLanguage?: string,
): number {
  return lines.filter(
    (l) => Boolean(lineTargetText(l, targetLanguage, sourceLanguage)),
  ).length
}

/** Deutsch sichern, Ziel-Slot leeren wenn dort noch die Muttersprache steht. Bilder/Regie bleiben. */
export function prepareLinesForTargetTranslation(
  lines: DialogLine[],
  targetLanguage?: string,
  sourceLanguage?: string,
): DialogLine[] {
  return lines.map((line) => {
    const kind = inferDialogLineKind(line)
    if (kind === 'action') {
      const native = lineStoryText(line)
      return applyNativeFirstDraftLine({ ...line, text: native, nativeText: native })
    }
    const native = lineNativeSourceForTarget(line)
    const spoken = (line.text || '').trim()
    const targetStillSource =
      !spoken ||
      spoken === native ||
      spokenLooksLikeSourceLanguage(spoken, sourceLanguage, targetLanguage)
    return {
      ...line,
      kind,
      nativeText: native || undefined,
      text: targetStillSource ? '' : spoken,
      audioUrl: targetStillSource ? undefined : line.audioUrl,
    }
  })
}

/** KI-Übersetzungen in text schreiben — nativeText, Regie und Standbilder bleiben. */
export function mergeTranslatedTargetLines(
  lines: DialogLine[],
  translated: Array<{ text?: string } | undefined>,
  targetLanguage?: string,
  sourceLanguage?: string,
): DialogLine[] {
  let j = 0
  return lines.map((line) => {
    if (!lineNeedsTargetTranslation(line, targetLanguage, sourceLanguage)) return line
    const target = translated[j++]?.text?.trim() || ''
    if (!target || spokenLooksLikeSourceLanguage(target, sourceLanguage, targetLanguage)) {
      return line
    }
    return applyTargetTranslationToLine(line, target)
  })
}

/** Alte Filme: Zielsprache steht, Deutsch oder Birkenbihl fehlt — «Deutsch unter die Zeilen». */
export function lineNeedsNativeFill(
  line: Pick<DialogLine, 'text' | 'nativeText' | 'birkenbihl' | 'kind' | 'speaker' | 'cueImage'>,
  targetLanguage?: string,
  sourceLanguage?: string,
): boolean {
  if (inferDialogLineKind(line) === 'action') return false
  if (lineNeedsTargetTranslation(line, targetLanguage, sourceLanguage)) return false
  if (!lineHasTargetSpeech(line)) return false
  if (!lineGermanText(line, targetLanguage, sourceLanguage)) return true
  if (!lineBirkenbihlWords(line).length) return true
  return false
}

export function dialogNeedsNativeFill(
  dialog: Pick<Dialog, 'sections'> & { targetLanguage?: string; sourceLanguage?: string },
): boolean {
  return dialog.sections.some((s) =>
    s.lines.some((l) => lineNeedsNativeFill(l, dialog.targetLanguage, dialog.sourceLanguage)),
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
