import type { FilmPlan, FilmStoryboard } from './film-storyboard.js'

export type DialogLength = 'short' | 'medium' | 'long'

export type CreateMode = 'chat' | 'topic' | 'dictate'

export interface BirkenbihlWord {
  text: string
  translation: string
  /** Lateinische Umschrift (z. B. Persisch: salām) – optional, nach Birkenbihl-Neuanwendung. */
  romanization?: string
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
  /** Regie Bild (Pose, Ort, wo die Figur steht). */
  cueImage?: string
  /** Regie Ton (Geräusch, Musik, Stille). */
  cueSound?: string
  /** Regie Sprache (laut, flüstern, Pause). */
  cueSpeech?: string
}

export interface LineImageBeat {
  id: string
  lineIndices: number[]
  reason: string
  prompt: string
  imageUrl?: string
}

export type SpeakerMood =
  | 'neutral'
  | 'happy'
  | 'surprised'
  | 'laughing'
  | 'sad'
  | 'crying'
  | 'sobbing'

export type PortraitFraming = 'bust' | 'three_quarter' | 'full_body'

/** Wohin der Sprecher schaut – nie direkt in die Kamera. */
export type PortraitGaze = 'at_partner' | 'aside' | 'down' | 'away'

/** Bild eines Sprechers aus Zuschauerperspektive neben dem Gegenüber. */
export interface SpeakerPortrait {
  id: string
  speaker: string
  mood: SpeakerMood
  gaze: PortraitGaze
  /** Gesprächspartner, den der Sprecher ansieht (off-camera). */
  addressee?: string
  /** Zeilen-Indizes (0-basiert im Abschnitt), die dieses Bild nutzen. */
  lineIndices: number[]
  framing: PortraitFraming
  prompt: string
  imageUrl?: string
  /** Kurz warum diese Mimik (Anzeige / Debug). */
  reason?: string
}

export interface DialogSection {
  id: string
  title: string
  lines: DialogLine[]
  imageUrl?: string
  imagePrompt?: string
  lineImageBeats?: LineImageBeat[]
  /** Bilder pro Sprecher/Mimik – wechseln in der Diashow beim Sprecher. */
  speakerPortraits?: SpeakerPortrait[]
}

/** Feste Figuren-Beschreibung für konsistente KI-Bilder (englisch, für Bild-Prompts). */
export interface CharacterVisual {
  name: string
  description: string
  /** Für unterschiedliche TTS-Stimmen pro Sprecher. */
  gender?: 'male' | 'female'
  /** Fest zugewiesene Cloud-TTS-Stimme – bleibt für diesen Sprecher konstant. */
  voiceName?: string
  /** Individuelles Portrait (Bild 0 pro Figur) – Vorlage für alle Szenenbilder. */
  portraitUrl?: string
  portraitPrompt?: string
}

/** Feste Szene (Ort, Hintergrund) – bleibt für mehrere Panels gleich. */
export interface VisualScene {
  id: string
  title: string
  settingEn: string
  backgroundEn: string
  lightingEn: string
  /**
   * Feste 3D-Geografie der Szene (Sitze links/rechts, Blickachsen, was hinter wem liegt).
   * Wird für Reverse-Shots / 180°-Regel in jedem Beat wiederholt.
   */
  spatialEn?: string
  /**
   * locked = Sitzgespräch, Hintergrund darf sich nicht ändern.
   * gradual = Spaziergang o.ä., Hintergrund darf sich langsam verschieben.
   */
  continuity?: 'locked' | 'gradual'
}

export type VisualArtStyle = 'photoreal' | 'illustration' | 'comic' | 'watercolor'

export type VisualCameraLanguage = 'picture_story' | 'dialog_coverage'

export type VisualShotType = 'two_shot' | 'insert' | 'speaker' | 'wide'

export interface VisualQuestion {
  id: string
  question: string
  options: { id: string; label: string }[]
}

/** Zwischen-Prompt: aus den Nutzer-Hinweisen wird eine feste Bild-Regie. */
export interface VisualBrief {
  version: 1
  artStyle: VisualArtStyle
  cameraLanguage: VisualCameraLanguage
  /** Englischer Stil-Lock für jedes Bild. */
  stylePromptEn: string
  ageEn: string
  settingEn: string
  castLockEn: string
  mustShowEn: string[]
  insertPlan: { globalLineIndex: number; whatEn: string }[]
  /** Der eigentliche Zwischen-Prompt für die Bild-KI. */
  directorPromptEn: string
  answers?: Record<string, string>
  testImageUrl?: string
  testApproved?: boolean
  extraConstraintsEn?: string
  criticNotesEn?: string
}

/** Ein Panel im Dialog-Comic – konsistente Figuren, wechselnde Mimik. */
export interface VisualScriptBeat {
  id: string
  sectionId: string
  lineIndices: number[]
  sceneId: string
  activeSpeaker: string
  addressee: string
  mood: SpeakerMood
  gaze: PortraitGaze
  framing: PortraitFraming
  /** Neues Setup (Szene/Person/Kamera) vs. nur Mimik-Variante. */
  newSetup: boolean
  cameraEn: string
  expressionEn: string
  prompt: string
  imageUrl?: string
  reason?: string
  shotType?: VisualShotType
  mustShowEn?: string
}

/** Bilderskript für den ganzen Dialog (wie Comic ohne Sprechblasen). */
export interface DialogVisualScript {
  version: 1
  scenes: VisualScene[]
  beats: VisualScriptBeat[]
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
  /** Gesetzt wenn Dialog im Klassenbereich liegt (für Klassenmitglieder lesbar). */
  classId?: string | null
  shareToken?: string | null
  /** Wie der Dialog erstellt wurde: topic | dictate | chat */
  creationMode?: CreateMode
  /** Ursprüngliche Eingabe (Thema, Diktat, …). */
  creationPrompt?: string
  /** Vollständiger Chat-Verlauf bei KI-Gespräch. */
  creationChat?: ChatMessage[]
  /** Ein Prompt für Handlung, Bild, Ton und Sprache — die Film-Vorstellung. */
  filmPrompt?: string
  /** Meta-Hinweise für Bilder (Setting, Emotionen wie Lachen/Weinen, Figuren). */
  imageDirection?: string
  /** Regie für Ton (Geräusche, Musik) — gilt fürs ganze Projekt, Zeilen können überschreiben. */
  soundDirection?: string
  /** Regie für Sprache (laut, Tempo, Pausen). */
  speechDirection?: string
  /** Billiges Film-Storyboard: Bibliothek zuerst, fehlende Posen merken. */
  filmStoryboard?: FilmStoryboard | null
  /** Film-Schritt: Stil pro Szene, Zielsprache, Timeline-Notizen. */
  filmPlan?: FilmPlan | null
  /** Bild 0: Cast-Referenz (intern, nicht in Diashow) – Standard für alle weiteren Bilder. */
  referenceImageUrl?: string
  referenceImagePrompt?: string
  /** Geschlecht pro Sprecher (wenn nicht aus Namen erkennbar). */
  speakerProfiles?: Record<
    string,
    { gender?: 'male' | 'female'; voiceName?: string; voicePrompt?: string }
  >
  /** Einmalig aus dem ganzen Dialog geplant – gleiche Personen auf allen Bildern. */
  characterBible?: CharacterVisual[]
  /** Fest zugewiesene Stimmen pro Sprechername. */
  speakerVoices?: Record<
    string,
    { gender: 'male' | 'female'; voiceName: string; voicePrompt?: string }
  >
  /** Comic-artiges Bilderskript: Szenen, Kamera, Mimik pro Zeile. */
  visualScript?: DialogVisualScript
  /** Bild-Regie aus Nutzer-Hinweis + Rückfragen (unsichtbarer Zwischen-Prompt). */
  visualBrief?: VisualBrief | null
  createdAt: string
  updatedAt: string
}

export type UserRole = 'master' | 'teacher' | 'student'

export type SubscriptionStatus = 'none' | 'active' | 'past_due' | 'canceled'

export interface DialogFolder {
  id: string
  userId: string
  name: string
  parentId: string | null
  /** Persönlicher Ordner oder gemeinsamer Klassenordner. */
  scope: 'personal' | 'class'
  classId?: string | null
  createdAt: string
  updatedAt: string
}

export interface ClassRoom {
  id: string
  name: string
  teacherId: string
  classCode: string
  rootFolderId: string
  createdAt: string
  updatedAt: string
}

export interface StudentCodeInfo {
  code: string
  classId: string
  label?: string
  userId?: string | null
  createdAt: string
}

export interface UsageQuota {
  dialogCreates: number
  aiCalls: number
  slideshowPreps: number
}

export interface User {
  id: string
  name: string
  email?: string
  authType: 'google' | 'student'
  role: UserRole
  /** Klasse(n) des Schülers bzw. Lehrer-Klassen (IDs). */
  classIds: string[]
  subscriptionStatus: SubscriptionStatus
  /** True wenn Pro-Zugriff (Master immer, Lehrer mit Abo). */
  proActive: boolean
  /** Verbleibendes Kontingent im aktuellen Monat (Server-Sicht). */
  quota?: UsageQuota
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

/** Zielsprachen, für die Birkenbihl eine lateinische Aussprache-Hilfe liefert. */
export const ROMANIZATION_LANGUAGES = new Set([
  'fa',
  'ar',
  'ja',
  'zh',
  'ko',
  'ru',
  'el',
  'he',
  'th',
  'hi',
  'uk',
])

export function needsRomanization(code: string): boolean {
  return ROMANIZATION_LANGUAGES.has(code.slice(0, 2).toLowerCase())
}

export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code
}

/**
 * ISO-Sprachcode → ISO-3166-1 alpha-2 Ländercode für Flaggen-Bilder (flagcdn.com).
 * Hinweis: Auf Windows rendern Emoji-Flaggen oft nur als Buchstaben (FR, RU …) —
 * deshalb PNG-Flags nutzen, nicht `languageFlag()`-Emojis allein.
 */
const LANGUAGE_COUNTRY_CODES: Record<string, string> = {
  de: 'de',
  en: 'gb',
  fr: 'fr',
  es: 'es',
  it: 'it',
  pt: 'pt',
  nl: 'nl',
  pl: 'pl',
  tr: 'tr',
  ja: 'jp',
  zh: 'cn',
  ar: 'sa',
  fa: 'ir',
  ru: 'ru',
  sv: 'se',
  da: 'dk',
  no: 'no',
  el: 'gr',
  cs: 'cz',
  hu: 'hu',
  ko: 'kr',
  kr: 'kr',
  ch: 'ch',
  he: 'il',
  th: 'th',
  hi: 'in',
  uk: 'ua',
}

/** Ländercode für Flaggen-CDN (z. B. flagcdn.com/w40/{code}.png). */
export function languageCountryCode(code: string): string {
  const key = code.slice(0, 2).toLowerCase()
  return LANGUAGE_COUNTRY_CODES[key] ?? 'un'
}

/** @deprecated Auf Windows oft nur Buchstaben — lieber LanguageFlag / PNG nutzen. */
export function languageFlag(code: string): string {
  const country = languageCountryCode(code).toUpperCase()
  if (country === 'UN') return '🏳️'
  // Regional-Indicator-Emojis (Fallback wo sie funktionieren)
  const a = 0x1f1e6 - 65
  return String.fromCodePoint(a + country.charCodeAt(0), a + country.charCodeAt(1))
}
