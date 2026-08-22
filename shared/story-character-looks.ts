/**
 * Feste Figuren-Looks fürs Story-Studio.
 * Julien und Lucien dürfen keine Zwillinge sein — gleicher Name reicht nicht.
 */

import { characterBaseName } from './character-parts.js'

export interface StoryCharacterLook {
  name: string
  /** Kurzer deutscher Hinweis unter dem Namens-Button */
  hintDe: string
  /** Text im Formular (Englisch, für die Bild-KI) */
  description: string
  /** Harte Identität für die Bild-KI — gewinnt gegen vage/alte Beschreibungen */
  identityLock: string
}

const JULIEN_DESC =
  '15-year-old boy, chestnut-brown hair with a middle part, clear brown eyes, friendly smile, saturated green hoodie with drawstrings (plain fabric, no text), medium-wash blue jeans, green sneakers with white laces'

const LUCIEN_DESC =
  '15-year-old boy, dark curly hair, round eyeglasses, hazel-green eyes, mustard-yellow cardigan over a navy polo, charcoal grey trousers, brown sneakers — not Julien, not a twin, never a green hoodie'

export const STORY_CHARACTER_LOOKS: StoryCharacterLook[] = [
  {
    name: 'Julien',
    hintDe: 'Grüner Hoodie, Scheitel',
    description: JULIEN_DESC,
    identityLock:
      'This is JULIEN: about 15, life-like French teen (not a toddler), chestnut-brown hair with a middle part, brown eyes, wide friendly smile, saturated green pullover hoodie (NO printed text or logos), blue jeans, green flat sneakers. He must not look like Lucien. If a reference photo is attached, copy that photo exactly and only change the pose.',
  },
  {
    name: 'Lucien',
    hintDe: 'Locken, Brille, senfgelb',
    description: LUCIEN_DESC,
    identityLock:
      'This is LUCIEN: about 15, life-like French teen, DISTINCT from Julien, NOT twins. Dark curly brown-black hair, round eyeglasses, hazel-green eyes, mustard-yellow cardigan over a navy polo, charcoal grey trousers, brown sneakers. NEVER a green hoodie, NEVER the same haircut or outfit as Julien. If a reference photo is attached, copy that photo exactly and only change the pose.',
  },
  {
    name: 'Guillaume',
    hintDe: 'Rotes Shirt, Scheitel, weisse Sneaker',
    description:
      '15-year-old boy, sandy-blond hair with a clear middle part and curtain bangs, blue-grey eyes, friendly smile, plain bright red crew-neck t-shirt with no text or logos, medium-wash blue jeans, white canvas sneakers with white laces and a thin black stripe on the rubber sole',
    identityLock:
      'This is GUILLAUME: about 15, the SAME boy every time — one identity, never a redesign. Sandy-blond hair with a middle part and curtain bangs (never dark brown, never a different cut). Blue-grey eyes. Plain bright red crew-neck t-shirt (no text). Medium-wash blue jeans. ALWAYS white canvas sneakers with white laces and a thin black stripe on the sole — never red shoes, never green shoes, never a different model. Same face, same hair, same clothes in every pose. If a reference photo is attached, copy that photo exactly and only change the pose.',
  },
  {
    name: 'Marc',
    hintDe: 'Rotes Shirt, blond',
    description:
      '14-year-old boy, sandy blond hair, blue eyes, red t-shirt, beige chinos, white-and-navy sneakers',
    identityLock:
      'This is MARC: about 14, sandy blond hair, blue eyes, red t-shirt (no text), beige chinos, white-and-navy sneakers. Distinct from Julien and Lucien.',
  },
  {
    name: 'Maman',
    hintDe: 'Mutter, Bluse',
    description:
      'French mother about 42, warm brown hair in a loose bun, kind brown eyes, floral blouse, olive trousers, indoor shoes',
    identityLock:
      'This is MAMAN: adult woman about 42, brown hair in a loose bun, floral blouse, olive trousers, kind expression. Not a teenager.',
  },
  {
    name: 'Papa',
    hintDe: 'Vater, Beige-Pullover',
    description:
      'French father about 45, short dark hair with a receding hairline, light stubble, beige sweater, dark trousers, brown shoes',
    identityLock:
      'This is PAPA: adult man about 45, short dark receding hair, light stubble, beige sweater, dark trousers. Not a teenager.',
  },
]

const LEGACY_GENERIC_DESCRIPTIONS = new Set([
  '8-year-old boy, round glasses, short brown hair, red t-shirt, blue jeans, friendly smile',
])

export const STORY_CHARACTER_ANATOMY_PROMPT =
  'FULL-BODY FRAMING (mandatory): pull the camera back so the COMPLETE person fits in the frame — top of hair, both hands, both legs from hips through knees and calves, both ankles, BOTH shoes including soles and toes. Leave empty studio space BELOW the shoe soles (feet must not touch the image border). ' +
  'FORBIDDEN: close-up, bust shot, waist-up, cropped at the knees, stump legs, missing feet, floating torso, amputated limbs. ' +
  'Eyes fully drawn with opaque white sclera, colored iris and pupil — never hollow, never sunglasses unless asked. ' +
  'Shoes stay fully painted even if pale, cream, or white. Clothing has NO letters or logos. Exactly ONE person. ' +
  'Hold the arms slightly away from the torso so the gaps under the armpits are visible. Spread the fingers slightly.'

export const STORY_CHARACTER_FRAMING_PROMPT =
  'Vertical full-body character. Entire figure from hair to shoe soles is inside the picture with empty studio margin on all sides, especially under the feet.'

/** Neutraler Studiohintergrund — Freistellen passiert danach über eine Personen-Maske, nicht über eine Key-Farbe. */
export const STORY_CHARACTER_CUTOUT_PROMPT =
  'Single character on a plain even light-gray studio backdrop (#D0D0D0) only. No floor, no shadow, no furniture, no other people. ' +
  'Clothes, hair, skin and shoes keep their real colors (red shirts stay red, white sneakers stay white).'

export const STORY_CHARACTER_MASK_PROMPT =
  'Create a black-and-white silhouette MASK of the person in this exact photo. Same size, same pose, same position. ' +
  'WHITE = every part of the person: hair, skin, eyes, teeth, ALL clothing (even red, green, yellow), ALL shoes (even white or cream sneakers). ' +
  'BLACK = studio background AND every see-through hole. ' +
  'CRITICAL holes that MUST be BLACK (not white, not gray): triangular gaps BETWEEN ARMS AND TORSO, armpits, between fingers, between the legs, beside the neck, inside sleeves if the studio shows through. ' +
  'If the photo has leftover gray studio in those gaps, paint those pixels BLACK. ' +
  'Do not paint clothes or shoes black. Do not use other colors. Only black, white, and a 1-pixel gray edge if needed.'

/** Farbkarte zum Zerlegen in Kopf / Rumpf+Arme / Beine — gleiche Pose und Position. */
export const STORY_CHARACTER_PART_MASK_PROMPT =
  'Create a color PART MAP of the person in this exact photo. Same size, same pose, same position. No art, no shading, no outlines. ' +
  'RED (#FF0000) = head, hair, face, neck down to the base of the neck — stop at the collarbone, do not include shoulders. ' +
  'GREEN (#00FF00) = torso, all clothing on the chest and belly, BOTH arms, BOTH hands. ' +
  'BLUE (#0000FF) = hips, both legs from the hip joints down, both shoes. ' +
  'BLACK (#000000) = studio background AND holes (between legs, under arms, between fingers). ' +
  'Use only these four colors. Do not move or resize the person.'

export function normalizeCharacterLookName(name: string): string {
  return characterBaseName(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

export function lookForCharacterName(name: string): StoryCharacterLook | undefined {
  const key = normalizeCharacterLookName(name)
  if (!key) return undefined
  return STORY_CHARACTER_LOOKS.find((look) => normalizeCharacterLookName(look.name) === key)
}

export function descriptionForCharacterName(name: string): string | undefined {
  return lookForCharacterName(name)?.description
}

export function isKnownLookDescription(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true
  if (LEGACY_GENERIC_DESCRIPTIONS.has(trimmed)) return true
  return STORY_CHARACTER_LOOKS.some((look) => look.description === trimmed)
}

export function resolveStoryCharacterAppearance(name: string, description: string): string {
  const look = lookForCharacterName(name)
  const userText = description.trim()
  const useLockedBody = look && (isKnownLookDescription(userText) || !userText)
  const appearance = useLockedBody ? look.description : userText || look?.description || name
  if (look) {
    return `${look.identityLock}\nAppearance: ${appearance}`
  }
  return appearance
}
