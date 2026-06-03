import type { SpeakerMood } from '../shared/types.js'

export const SPEAKER_MOODS: SpeakerMood[] = [
  'neutral',
  'happy',
  'surprised',
  'laughing',
  'sad',
  'crying',
  'sobbing',
]

export const MOOD_LABELS: Record<SpeakerMood, string> = {
  neutral: 'neutral',
  happy: 'fröhlich',
  surprised: 'überrascht',
  laughing: 'lachend',
  sad: 'traurig',
  crying: 'weinend',
  sobbing: 'schluchzend',
}

export const MOOD_PROMPT_EN: Record<SpeakerMood, string> = {
  neutral: 'calm friendly expression while speaking',
  happy: 'warm happy smile, eyes bright, pleasant mood',
  surprised: 'surprised expression, raised eyebrows, reacting to partner',
  laughing: 'genuine laugh, open mouth smile, amused cheerful expression',
  sad: 'gentle sad expression, soft melancholy in the eyes',
  crying: 'tears in eyes, emotional crying expression, still in conversation',
  sobbing: 'sobbing with visible tears, distressed but speaking, hand may near face',
}

export function isSpeakerMood(value: string): value is SpeakerMood {
  return (SPEAKER_MOODS as string[]).includes(value)
}

export function normalizeSpeakerMood(value: string | undefined): SpeakerMood {
  if (value && isSpeakerMood(value)) return value
  return 'neutral'
}
