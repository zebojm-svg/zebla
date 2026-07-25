export const IMAGE_ASPECT_RATIO = '16:9' as const

export const PHOTOREALISTIC_STYLE =
  'Photorealistic cinematic photograph, live-action movie still, widescreen 16:9 landscape frame, natural soft lighting, shallow depth of field, high detail, realistic skin texture. ' +
  'Compose for a wide horizontal frame with room for faces and environment; avoid tall portrait crops. ' +
  'NOT comic book, NOT cartoon, NOT illustration, NOT anime, NOT drawn, NOT sketch, NOT cel-shaded, NOT graphic novel. No text or labels in the image.'

/** Erscheinungsbild für Figuren – ansprechend, aber nicht explizit (Sprachlern-Kontext). */
export const CAST_APPEARANCE_GUIDE =
  'Attractive young adults in modest fully clothed everyday or smart-casual outfits, tasteful PG-rated language-learning context, never nude or sexually suggestive. ' +
  'Women: feminine soft curves and graceful proportions, warm natural beauty. ' +
  'Men: lean athletic build with visible Adam\'s apple and strong masculine jaw. ' +
  'Stylish eyeglasses welcome when they suit the character. Photorealistic, approachable, well-groomed.'

/**
 * Harte Regeln gegen erfundene Extra-Personen und falsche Hinterköpfe.
 * castNames = alle Dialog-Sprecher; visibleSpeaker = wer im Bild klar zu sehen ist.
 */
export function castIntegrityRules(opts: {
  castNames: string[]
  visibleSpeaker: string
  addressee?: string
}): string {
  const n = opts.castNames.length
  const castList = opts.castNames.join(', ')
  const partner = opts.addressee?.trim()
  return (
    `CAST INTEGRITY (CRITICAL): This dialog has EXACTLY ${n} named character${n === 1 ? '' : 's'}: ${castList}. ` +
    `Show EXACTLY ONE person in the frame: ${opts.visibleSpeaker} (face clearly visible). ` +
    `Do NOT invent extra people. Do NOT add a third diner, waiter, bystander, child, or crowd. ` +
    `Empty chairs / table space may exist, but no additional human figures. ` +
    (partner
      ? `${partner} is the conversation partner and must be COMPLETELY OUT OF FRAME ` +
        `(no shoulder, no back of head, no blurry hair silhouette in the foreground). ` +
        `Camera sits where ${partner} would sit, looking at ${opts.visibleSpeaker} — ` +
        `as if ${partner} left the seat empty so we only see ${opts.visibleSpeaker}. `
      : '') +
    `Never show an over-the-shoulder back-of-head of another person — that causes identity errors. `
  )
}
