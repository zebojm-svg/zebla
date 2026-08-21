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
      'This is JULIEN: about 15, life-like French teen (not a toddler), chestnut-brown hair with a middle part, brown eyes, wide friendly smile, saturated green pullover hoodie (NO printed text or logos), blue jeans, green flat sneakers. He must not look like Lucien.',
  },
  {
    name: 'Lucien',
    hintDe: 'Locken, Brille, senfgelb',
    description: LUCIEN_DESC,
    identityLock:
      'This is LUCIEN: about 15, life-like French teen, DISTINCT from Julien, NOT twins. Dark curly brown-black hair, round eyeglasses, hazel-green eyes, mustard-yellow cardigan over a navy polo, charcoal grey trousers, brown sneakers. NEVER a green hoodie, NEVER the same haircut or outfit as Julien.',
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
  'FULL-BODY FRAMING (mandatory): pull the camera back so the COMPLETE person fits in the frame — top of hair, both hands, both legs from hips through knees and calves, both ankles, BOTH shoes including soles and toes. Leave a band of empty white background BELOW the shoe soles (feet must not touch the image border). ' +
  'FORBIDDEN: close-up, bust shot, waist-up, cropped at the knees, stump legs, missing feet, floating torso, amputated limbs. ' +
  'Eyes fully drawn with opaque white sclera, colored iris and pupil — never transparent, never hollow, never sunglasses unless asked. ' +
  'Shoes are saturated/dark colors (never white shoes). Clothing has NO letters or logos. Exactly ONE person.'

export const STORY_CHARACTER_FRAMING_PROMPT =
  'Vertical full-body character cutout. Entire figure from hair to shoe soles is inside the picture with white margin on all sides, especially under the feet.'

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
