import { getStoryStylePrompt, isStoryArtStyleId } from '../shared/story-art-styles.js'

export const IMAGE_ASPECT_RATIO = '16:9' as const

export const PAINT_STYLE_FIRST =
  'STYLE OVERRIDE, highest priority. Draw in this style. Ignore any sentence that asks for a photograph, live-action, or a different drawing style.'

export const PHOTOREALISTIC_STYLE =
  'Photorealistic cinematic photograph, live-action movie still, widescreen 16:9 landscape frame, natural soft lighting, shallow depth of field, high detail, realistic skin texture. ' +
  'Compose for a wide horizontal frame with room for faces and environment; avoid tall portrait crops. ' +
  'NOT comic book, NOT cartoon, NOT illustration, NOT anime, NOT drawn, NOT sketch, NOT cel-shaded, NOT graphic novel. No text or labels in the image.'

export const ILLUSTRATION_STYLE = getStoryStylePrompt('filmzeichnung')

export const COMIC_STYLE =
  'Graphic-novel comic illustration, clean ink, flat colors, consistent character model sheet, widescreen 16:9. ' +
  'NOT photorealistic, NOT a photograph. No speech bubbles, no captions, no text in the image.'

export const WATERCOLOR_STYLE =
  'Soft watercolor storybook painting, visible paper grain, gentle colors, readable faces, widescreen 16:9. ' +
  'NOT photorealistic photograph. No text or labels in the image.'

/** Erscheinungsbild für Figuren – ansprechend, aber nicht explizit (Sprachlern-Kontext). */
export const CAST_APPEARANCE_GUIDE =
  'Attractive young adults in modest fully clothed everyday or smart-casual outfits, tasteful PG-rated language-learning context, never nude or sexually suggestive. ' +
  'Women: feminine soft curves and graceful proportions, warm natural beauty. ' +
  'Men: lean athletic build with visible Adam\'s apple and strong masculine jaw. ' +
  'Stylish eyeglasses welcome when they suit the character. Photorealistic, approachable, well-groomed.'

export const CAST_STORYBOOK_GUIDE =
  'Age-accurate storybook characters, fully clothed, PG-rated language-learning context, never nude or sexually suggestive. ' +
  'Each person has a unique haircut, outfit color, and one distinguishing feature so they stay recognizable. Keep the same clothes in every frame.'

/** Foto nur, wenn es bewusst gewählt wurde. Sonst die Filmzeichnung. Ein Reiter-Stil gilt zuerst. */
export function paintingStyleText(artStyle?: string | null, chosenStyle?: string | null): string {
  const picked = [chosenStyle, artStyle].find((id) => id && isStoryArtStyleId(id))
  if (picked && isStoryArtStyleId(picked)) {
    if (picked === 'fotorealistisch') return PHOTOREALISTIC_STYLE
    return getStoryStylePrompt(picked)
  }
  if (chosenStyle === 'photoreal' || artStyle === 'photoreal') return PHOTOREALISTIC_STYLE
  if (chosenStyle === 'comic' || artStyle === 'comic') return COMIC_STYLE
  if (chosenStyle === 'watercolor' || artStyle === 'watercolor') return WATERCOLOR_STYLE
  return getStoryStylePrompt('filmzeichnung')
}

export function paintingAppearance(
  artStyle?: string | null,
  chosenStyle?: string | null,
  ageEn?: string,
  castLockEn?: string,
): string {
  if (chosenStyle === 'photoreal' || chosenStyle === 'fotorealistisch' || artStyle === 'fotorealistisch') {
    return castLockEn || appearanceGuideFor('photoreal', ageEn)
  }
  if (chosenStyle === 'comic' || artStyle === 'comic' || chosenStyle === 'watercolor' || artStyle === 'watercolor') {
    return castLockEn || CAST_STORYBOOK_GUIDE
  }
  return CAST_STORYBOOK_GUIDE
}

export function styleLockPrompt(
  artStyle: 'photoreal' | 'illustration' | 'comic' | 'watercolor' | undefined,
): string {
  if (artStyle === 'illustration') return ILLUSTRATION_STYLE
  if (artStyle === 'comic') return COMIC_STYLE
  if (artStyle === 'watercolor') return WATERCOLOR_STYLE
  return PHOTOREALISTIC_STYLE
}

export function appearanceGuideFor(
  artStyle?: 'photoreal' | 'illustration' | 'comic' | 'watercolor',
  ageEn?: string,
): string {
  const age = (ageEn ?? '').toLowerCase()
  const isKidOrTeen =
    age.includes('teen') ||
    age.includes('child') ||
    age.includes('13') ||
    age.includes('15') ||
    age.includes('8–12') ||
    age.includes('8-12')
  if (artStyle === 'photoreal' && !isKidOrTeen) {
    return CAST_APPEARANCE_GUIDE
  }
  if (artStyle === 'photoreal') {
    return (
      `Photorealistic people matching this age: ${ageEn || 'the ages implied by the story'}. ` +
      'Fully clothed, PG-rated language-learning context. Distinct outfits and hair so each person is unique. Same clothes in every frame.'
    )
  }
  return CAST_STORYBOOK_GUIDE
}

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
