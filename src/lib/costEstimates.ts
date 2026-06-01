export interface CostEstimate {
  title: string
  description: string
  items: { label: string; amount: string }[]
  totalHint: string
  note?: string
}

function lineCount(dialog: { sections: { lines: { text: string; audioUrl?: string }[] }[] }): number {
  return dialog.sections.reduce(
    (n, s) => n + s.lines.filter((l) => l.text.trim()).length,
    0,
  )
}

export function estimateMissingTts(dialog: {
  sections: { lines: { text: string; audioUrl?: string }[] }[]
}): CostEstimate {
  const missing = dialog.sections.reduce(
    (n, s) => n + s.lines.filter((l) => l.text.trim() && !l.audioUrl).length,
    0,
  )
  const cents = Math.max(1, Math.round(missing * 0.2))
  return {
    title: 'Cloud-Sprachausgabe erzeugen',
    description: `${missing} Zeile${missing !== 1 ? 'n' : ''} ohne gespeichertes Audio.`,
    items: [
      { label: 'Neue TTS-Zeilen', amount: String(missing) },
      { label: 'Geschätzte Kosten', amount: `ca. ${cents} Cent` },
    ],
    totalHint: `ca. ${cents} Cent (einmalig; danach Wiedergabe gratis)`,
    note: 'Bereits gespeicherte Zeilen (z. B. 18/18) kosten beim Abspielen nichts mehr.',
  }
}

export function estimateBirkenbihl(lineCount: number): CostEstimate {
  const cents = Math.max(1, Math.round(lineCount * 0.15))
  return {
    title: 'Birkenbihl anwenden',
    description: 'KI ordnet jedem Wort eine Übersetzung zu (Text-KI).',
    items: [
      { label: 'Dialogzeilen', amount: String(lineCount) },
      { label: 'Geschätzte Kosten', amount: `ca. ${cents} Cent` },
    ],
    totalHint: `ca. ${cents} Cent`,
  }
}

export function estimateTranslate(lineCount: number): CostEstimate {
  const cents = Math.max(2, Math.round(lineCount * 0.2))
  return {
    title: 'Dialog übersetzen',
    description: 'KI übersetzt alle Zeilen (Text-KI).',
    items: [
      { label: 'Dialogzeilen', amount: String(lineCount) },
      { label: 'Geschätzte Kosten', amount: `ca. ${cents} Cent` },
    ],
    totalHint: `ca. ${cents} Cent`,
  }
}

export function estimateSectionImage(): CostEstimate {
  return {
    title: 'Titelbild generieren',
    description: 'Ein KI-Bild für den Abschnitt (inkl. Figuren-Planung beim ersten Mal).',
    items: [{ label: 'Bilder', amount: '1' }, { label: 'Geschätzte Kosten', amount: 'ca. 2–5 Cent' }],
    totalHint: 'ca. 2–5 Cent',
    note: 'Beim ersten Mal wird der ganze Dialog für feste Figuren gelesen (+ wenig Text-KI).',
  }
}

export function estimateSceneImages(portraitCount = 2): CostEstimate {
  const cents = Math.max(4, portraitCount * 3)
  return {
    title: 'Sprecher-Porträts generieren',
    description: `KI erzeugt ${portraitCount} Nahporträts (direkter Blick, Mimik passend zum Dialog).`,
    items: [
      { label: 'Porträts pro Abschnitt', amount: String(portraitCount) },
      { label: 'Geschätzte Kosten', amount: `ca. ${cents}–${cents + 4} Cent` },
    ],
    totalHint: `ca. ${cents}–${cents + 4} Cent`,
    note: 'Ein Porträt pro Sprecher – wechselt automatisch beim Sprechen.',
  }
}

export function estimateAllSectionImages(sectionCount: number): CostEstimate {
  const cents = sectionCount * 4
  return {
    title: 'Alle Abschnitts-Bilder',
    description: `${sectionCount} Titelbilder für alle Abschnitte.`,
    items: [
      { label: 'Abschnitte', amount: String(sectionCount) },
      { label: 'Geschätzte Kosten', amount: `ca. ${cents}–${cents + sectionCount * 2} Cent` },
    ],
    totalHint: `ca. ${cents}–${cents + sectionCount * 2} Cent`,
  }
}

export { lineCount }
