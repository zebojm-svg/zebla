export const PHOTOREALISTIC_STYLE =
  'Photorealistic cinematic photograph, live-action movie still, natural soft lighting, shallow depth of field, high detail, realistic skin texture. ' +
  'NOT comic book, NOT cartoon, NOT illustration, NOT anime, NOT drawn, NOT sketch, NOT cel-shaded, NOT graphic novel. No text or labels in the image.'

export const ILLUSTRATION_STYLE =
  'Children\'s book illustration: clear ink line, watercolor washes, consistent character designs, storybook lighting. ' +
  'NOT photorealistic, NOT live-action, NOT a photograph, NOT 3D CGI, NOT anime. No text, logos, or speech bubbles in the image.'

export const COMIC_STYLE =
  'Graphic-novel comic illustration, clean ink, flat colors, consistent character model sheet. ' +
  'NOT photorealistic, NOT a photograph. No speech bubbles, no captions, no text in the image.'

export const WATERCOLOR_STYLE =
  'Soft watercolor storybook painting, visible paper grain, gentle colors, readable faces. ' +
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
