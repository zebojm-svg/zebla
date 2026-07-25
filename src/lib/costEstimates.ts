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

export function estimateRegenerateTts(dialog: {
  sections: { lines: { text: string; audioUrl?: string; birkenbihl?: { text: string }[] }[] }[]
}): CostEstimate {
  const total = dialog.sections.reduce(
    (n, s) =>
      n +
      s.lines.filter((l) => {
        const t = l.birkenbihl?.length
          ? l.birkenbihl.map((w) => w.text.trim()).filter(Boolean).join(' ')
          : l.text.trim()
        return Boolean(t)
      }).length,
    0,
  )
  const cents = Math.max(1, Math.round(total * 0.2))
  return {
    title: 'Audio neu erstellen',
    description: `Alle ${total} Zeile${total !== 1 ? 'n' : ''} werden erneut mit Cloud-TTS erzeugt (bestehende MP3s werden ersetzt).`,
    items: [
      { label: 'Zeilen', amount: String(total) },
      { label: 'Geschätzte Kosten', amount: `ca. ${cents} Cent` },
    ],
    totalHint: `ca. ${cents} Cent`,
    note: 'Nur nötig nach Textänderung, Birkenbihl, Sprachmodell-Upgrade (z. B. Koreanisch → Gemini-TTS) oder wenn die falsche Sprache gesprochen wurde.',
  }
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
  const cents = Math.max(6, portraitCount * 3 + 4)
  return {
    title: 'Dialogbilder / Bilderskript',
    description: `Zuerst Figuren-Portraits + Gruppen-Referenz, dann ${portraitCount} konsistente Szenenbilder abgeleitet vom Original.`,
    items: [
      { label: 'Portraits + Szenen', amount: String(portraitCount + 2) },
      { label: 'Geschätzte Kosten', amount: `ca. ${cents}–${cents + 6} Cent` },
    ],
    totalHint: `ca. ${cents}–${cents + 6} Cent`,
    note: 'Figuren-Portraits zuerst; Szenen zeigen nur den sprechenden Charakter (kein Hinterkopf, keine Extra-Personen).',
  }
}

export function estimateAllSectionImages(sectionCount: number): CostEstimate {
  const cents = sectionCount * 4
  return {
    title: 'Alle Titelbilder',
    description: `${sectionCount} Titelbilder für alle Abschnitte.`,
    items: [
      { label: 'Abschnitte', amount: String(sectionCount) },
      { label: 'Geschätzte Kosten', amount: `ca. ${cents}–${cents + sectionCount * 2} Cent` },
    ],
    totalHint: `ca. ${cents}–${cents + sectionCount * 2} Cent`,
  }
}

export function estimateAllSceneImages(
  sectionCount: number,
  approxBeatsPerSection = 3,
): CostEstimate {
  const portraits = 2
  const scenes = sectionCount * approxBeatsPerSection
  const total = portraits + 1 + scenes
  const cents = Math.max(10, total * 3)
  return {
    title: 'Alle Dialogbilder neu',
    description:
      `Figuren-Portraits + Referenz-Cast neu, danach alle ${scenes} Szenenbilder aus den Originalen ableiten ` +
      `(${sectionCount} Abschnitte).`,
    items: [
      { label: 'Bilder gesamt (ca.)', amount: String(total) },
      { label: 'Geschätzte Kosten', amount: `ca. ${cents}–${cents + sectionCount * 4} Cent` },
    ],
    totalHint: `ca. ${cents}–${cents + sectionCount * 4} Cent`,
    note: 'Bestehende Szenenbilder werden ersetzt. Danach ggf. „Audio neu erstellen“ für bessere Stimmen.',
  }
}

export { lineCount }
