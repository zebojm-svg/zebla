export type DialogLength = 'short' | 'medium' | 'long'

export type CreateMode = 'chat' | 'topic' | 'dictate'

export interface BirkenbihlWord {
  text: string
  translation: string
}

export interface DialogLine {
  id: string
  speaker: string
  text: string
  birkenbihl?: BirkenbihlWord[]
  imageUrl?: string
  imagePrompt?: string
  /** Gespeicherte Cloud-TTS-Audiodatei (wird nur einmal generiert). */
  audioUrl?: string
}

export interface LineImageBeat {
  id: string
  lineIndices: number[]
  reason: string
  prompt: string
  imageUrl?: string
}

export interface DialogSection {
  id: string
  title: string
  lines: DialogLine[]
  imageUrl?: string
  imagePrompt?: string
  lineImageBeats?: LineImageBeat[]
}

export interface Dialog {
  id: string
  userId: string
  title: string
  sourceLanguage: string
  targetLanguage: string
  length: DialogLength
  sections: DialogSection[]
  folderId?: string | null
  shareToken?: string | null
  createdAt: string
  updatedAt: string
}

export interface DialogFolder {
  id: string
  userId: string
  name: string
  parentId: string | null
  createdAt: string
  updatedAt: string
}

export interface User {
  id: string
  name: string
  email?: string
  authType: 'google' | 'student'
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export const LENGTH_LABELS: Record<DialogLength, string> = {
  short: 'Kurz (4–6 Zeilen)',
  medium: 'Mittel (8–12 Zeilen)',
  long: 'Lang (14–20 Zeilen)',
}

export const LANGUAGES = [
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'Englisch' },
  { code: 'fr', name: 'Französisch' },
  { code: 'es', name: 'Spanisch' },
  { code: 'it', name: 'Italienisch' },
  { code: 'pt', name: 'Portugiesisch' },
  { code: 'nl', name: 'Niederländisch' },
  { code: 'pl', name: 'Polnisch' },
  { code: 'tr', name: 'Türkisch' },
  { code: 'ja', name: 'Japanisch' },
  { code: 'zh', name: 'Chinesisch' },
  { code: 'ar', name: 'Arabisch' },
  { code: 'fa', name: 'Persisch/Dari' },
  { code: 'ru', name: 'Russisch' },
  { code: 'sv', name: 'Schwedisch' },
  { code: 'da', name: 'Dänisch' },
  { code: 'no', name: 'Norwegisch' },
  { code: 'el', name: 'Griechisch' },
  { code: 'cs', name: 'Tschechisch' },
  { code: 'hu', name: 'Ungarisch' },
  { code: 'ko', name: 'Koreanisch' },
] as const

export const RTL_LANGUAGES = new Set(['ar', 'fa'])

export function isRtlLanguage(code: string): boolean {
  return RTL_LANGUAGES.has(code)
}

export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code
}
