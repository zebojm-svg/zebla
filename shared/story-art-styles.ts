/** Bildstile für Story-Engine (Figuren, Umgebungen, Szenen) */

export type StoryArtStyleId =
  | 'petit-nicolas'
  | 'kinderbuch-aquarell'
  | 'comic'
  | 'anime'
  | 'fotorealistisch'
  | 'schwarzweiss'

export interface StoryArtStyle {
  id: StoryArtStyleId
  label: string
  description: string
  prompt: string
}

const NO_TEXT = 'NO text, NO speech bubbles, NO labels, NO captions in the image.'

export const STORY_ART_STYLES: StoryArtStyle[] = [
  {
    id: 'petit-nicolas',
    label: 'Petit Nicolas (knallige Farben)',
    description: 'Fröhliche Kinderbuch-Zeichnung mit satten Primärfarben — lebendig, nicht altbacken.',
    prompt:
      `Style: classic French children's school-story illustration (mid-20th century European storybook), ` +
      `bold saturated primary colors — vibrant red, strong blue, sunny yellow, fresh green, ` +
      `clean black ink outlines, flat cheerful color fills, minimal soft shading, ` +
      `playful energetic composition, lively school-age children, warm indoor/outdoor scenes. ` +
      `Knallige Farben, NOT muted, NOT sepia, NOT dusty vintage, NOT photorealistic, NOT anime. ` +
      `${NO_TEXT}`,
  },
  {
    id: 'kinderbuch-aquarell',
    label: 'Kinderbuch Aquarell (sanft)',
    description: 'Warmes, etwas nostalgisches Aquarell mit weichen Pastelltönen.',
    prompt:
      `Style: warm European children's book watercolor illustration, soft pen outlines, ` +
      `muted warm palette (beige, cream, soft wood tones, gentle pastels), ` +
      `detailed everyday interiors, slightly whimsical proportions, soft natural lighting. ` +
      `NOT photorealistic, NOT anime. ${NO_TEXT}`,
  },
  {
    id: 'comic',
    label: 'Comic',
    description: 'Klare Linien, flache Farben — Graphic Novel.',
    prompt:
      `Style: graphic novel comic illustration, clean ink lines, flat bold colors, ` +
      `consistent character design, dynamic readable poses, widescreen-friendly composition. ` +
      `NOT photorealistic, NOT photograph. ${NO_TEXT}`,
  },
  {
    id: 'anime',
    label: 'Anime',
    description: 'Japanischer Animationsstil, cel-shaded.',
    prompt:
      `Style: anime illustration, cel-shaded coloring, clean line art, expressive faces, ` +
      `vibrant but harmonious palette, soft gradient backgrounds optional. ` +
      `NOT photorealistic, NOT western cartoon. ${NO_TEXT}`,
  },
  {
    id: 'fotorealistisch',
    label: 'Fotorealistisch',
    description: 'Wie ein Foto / Filmstill.',
    prompt:
      `Style: photorealistic cinematic photograph, live-action movie still, natural soft lighting, ` +
      `shallow depth of field, realistic textures and skin, widescreen composition. ` +
      `NOT illustration, NOT cartoon, NOT anime, NOT drawn. ${NO_TEXT}`,
  },
  {
    id: 'schwarzweiss',
    label: 'Alte Schwarzweiss-Fotografie',
    description: 'Vintage-Foto, Korn, Kontrast.',
    prompt:
      `Style: vintage black and white photograph, 1940s-1960s film aesthetic, ` +
      `visible film grain, strong contrast, soft vignette, documentary feel. ` +
      `Monochrome only, no color. NOT illustration, NOT color photo. ${NO_TEXT}`,
  },
]

export const DEFAULT_STORY_ART_STYLE: StoryArtStyleId = 'petit-nicolas'

export function getStoryArtStyle(id?: string | null): StoryArtStyle {
  const found = STORY_ART_STYLES.find((s) => s.id === id)
  return found ?? STORY_ART_STYLES[0]!
}

export function getStoryStylePrompt(id?: string | null): string {
  return getStoryArtStyle(id).prompt
}

export function isStoryArtStyleId(value: string): value is StoryArtStyleId {
  return STORY_ART_STYLES.some((s) => s.id === value)
}
