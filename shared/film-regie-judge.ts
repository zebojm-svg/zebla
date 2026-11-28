/**
 * Die Regie prüft ein fertiges Bild mit einer festen Prüfliste.
 * Zuerst beschreibt sie nüchtern, was zu sehen ist, dann beantwortet sie jede Prüfung mit ja oder nein.
 * Keine Regeln für bestimmte Orte oder Lagen — die Prüfungen gelten für jede Geschichte.
 */

export type RegieCheckId =
  | 'personen'
  | 'koerper'
  | 'aussehen'
  | 'ort'
  | 'flaechen'
  | 'handlung'
  | 'kamera'
  | 'blick'
  | 'neu'
  | 'schrift'

export interface RegieCheckRule {
  id: RegieCheckId
  /** Harte Fehler lassen neu malen. Weiche Punkte stehen nur unter dem Bild. */
  hard: boolean
  /** Kurzer Name für Jean-Marie. */
  labelDe: string
  askDe: string
}

export const REGIE_CHECKS: RegieCheckRule[] = [
  {
    id: 'personen',
    hard: true,
    labelDe: 'Leute',
    askDe:
      'Genau die Leute aus dem Plan sind zu sehen, jede höchstens einmal. Körperlich im Raum nur, wer laut Plan dort ist; auf einer Fläche nur, wer laut Plan dort zu sehen ist. Keine fremde Person, kein Doppelgänger.',
  },
  {
    id: 'koerper',
    hard: true,
    labelDe: 'Körper',
    askDe:
      'Keine überzähligen oder herrenlosen Körperteile: jede Hand, jedes Bein, jeder Fuss, jeder Kopf gehört sichtbar zu einer erlaubten Person und sitzt an der richtigen Stelle.',
  },
  {
    id: 'aussehen',
    hard: true,
    labelDe: 'Aussehen',
    askDe: 'Jede Person sieht aus wie im Regiebuch und auf ihrem Stammbild: Gesicht, Haare, Kleidung, was sie trägt.',
  },
  {
    id: 'ort',
    hard: true,
    labelDe: 'Ort',
    askDe:
      'Der Raum um die Leute und um die Geräte (Wände, Boden, Fenster, Möbel, Dinge an der Wand) ist der Ort der Kamera aus dem Plan. Er passt zum Regiebuch, zur Raum-Vorlage und zu früheren Bildern desselben Ortes. Nichts davon gehört zu einem anderen Ort. Stellen Plan oder Regiebuch ein Möbel an eine bestimmte Wand oder Seite und du siehst es an einer anderen, ist diese Prüfung nicht bestanden.',
  },
  {
    id: 'flaechen',
    hard: true,
    labelDe: 'Bild im Bild',
    askDe:
      'Was auf Bildschirmen, Spiegeln, Tafeln oder Bildern zu sehen ist, zeigt das, was der Plan dafür sagt, mit dem dort genannten Ort. Solche Inhalte gibt es nur innerhalb ihres Geräts oder Rahmens; nichts schwebt frei in der Luft. Nennt der Plan keine Fläche, schwebt auch nichts frei im Raum.',
  },
  {
    id: 'handlung',
    hard: true,
    labelDe: 'Handlung',
    askDe: 'Was in diesem Satz passiert (Handlung, Geste, Ausdruck), ist deutlich zu sehen.',
  },
  {
    id: 'kamera',
    hard: true,
    labelDe: 'Kamera',
    askDe:
      'Kamera-Standort, Richtung (von vorne, von der Seite, von hinten) und Nähe sind wie im Plan. Vergleiche dazu deine Beschreibung unter camera mit dem Plan: sagt der Plan «von vorne» und du hast «von hinten» gesehen (oder umgekehrt), ist diese Prüfung nicht bestanden. Der Hintergrund passt zur Blickrichtung: schaut die Kamera in die andere Richtung als auf einem früheren Bild am selben Ort, ist die gegenüberliegende Wand zu sehen.',
  },
  {
    id: 'blick',
    hard: true,
    labelDe: 'Blick',
    askDe:
      'Die Leute posieren nicht für den Zuschauer. Sie schauen ihr Gegenüber an oder das, womit sie beschäftigt sind, wie im Plan, ausser der Satz spricht den Zuschauer an.',
  },
  {
    id: 'neu',
    hard: true,
    labelDe: 'Neues Bild',
    askDe:
      'Das Bild ist nicht fast gleich wie das vorige Bild (gleicher Bildaufbau und gleiche Haltung), ausser der Plan sagt «gleicher Blick wie das vorige Bild: ja». Gibt es kein voriges Bild, ist diese Prüfung bestanden.',
  },
  {
    id: 'schrift',
    hard: false,
    labelDe: 'Schrift',
    askDe: 'Keine unlesbare Fantasie-Schrift auf Zetteln, Schildern, Büchern oder Bildschirmen, ausser der Satz braucht Schrift.',
  },
]

const RULE_IDS = new Set<string>(REGIE_CHECKS.map((rule) => rule.id))

export function isHardCheck(id: string): boolean {
  return REGIE_CHECKS.some((rule) => rule.id === id && rule.hard)
}

export interface RegieVerdict {
  ok: boolean
  /** false = die Regie konnte nicht prüfen (Fehler, Zeitlimit, Bild fehlt). Dann ist ok auch false, aber es ist kein Fehler im Bild. */
  checked: boolean
  noteDe: string
  fixEn: string
  /** Das Bild hat Dinge aus einem falschen früheren Bild übernommen: beim nächsten Versuch ohne diese Bilder. */
  freshRefs: boolean
  /** Nicht bestandene harte Prüfungen. */
  failed: RegieCheckId[]
  /** Weiche Punkte (z.B. Schrift): stehen unter dem Bild, lassen nicht neu malen. */
  softDe: string
  /** Was die Regie auf dem Bild gesehen hat, kurz. */
  seenDe: string
  model?: string
  /** Warum nicht das gewünschte Modell geantwortet hat («Flash statt Pro, weil …»). */
  modelNoteDe?: string
}

export const REGIE_PASS: RegieVerdict = {
  ok: true,
  checked: true,
  noteDe: '',
  fixEn: '',
  freshRefs: false,
  failed: [],
  softDe: '',
  seenDe: '',
}

export function uncheckedVerdict(reasonDe: string, model?: string): RegieVerdict {
  const reason = reasonDe.trim().replace(/[.\s]+$/, '') || 'Grund unbekannt'
  return {
    ok: false,
    checked: false,
    noteDe: `Nicht geprüft: ${reason}.`.slice(0, 240),
    fixEn: '',
    freshRefs: false,
    failed: [],
    softDe: '',
    seenDe: '',
    ...(model ? { model } : {}),
  }
}

/** Fast dasselbe Bild wie ein früheres, obwohl der Plan ein neues will. Ohne KI erkannt. */
export function nearCopyVerdict(): RegieVerdict {
  return {
    ok: false,
    checked: true,
    noteDe: 'Fast dasselbe Bild wie ein früheres, obwohl dieser Satz ein neues Bild braucht.',
    fixEn:
      'The last try was almost a copy of an earlier picture. Paint a clearly new picture for this line: new pose and framing that show what happens in this line. Do not reuse the composition of any attached picture.',
    freshRefs: false,
    failed: ['neu'],
    softDe: '',
    seenDe: '',
    model: 'bildvergleich',
  }
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function passValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const word = value.trim().toLowerCase()
    if (['true', 'ja', 'yes', 'ok', 'pass'].includes(word)) return true
    if (['false', 'nein', 'no', 'fail'].includes(word)) return false
  }
  return null
}

function seenSummary(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim().slice(0, 500)
  if (!raw || typeof raw !== 'object') return ''
  return Object.entries(raw as Record<string, unknown>)
    .map(([key, value]) => {
      const text = Array.isArray(value) ? value.map((item) => clip(item, 160)).filter(Boolean).join('; ') : clip(value, 200)
      return text ? `${key}: ${text}` : ''
    })
    .filter(Boolean)
    .join(' | ')
    .slice(0, 500)
}

export type CameraView = 'vorne' | 'hinten'

const VIEW_FRONT =
  /\bvon\s+vorn(?:e)?\b|\bvorn(?:e)?[- ](?:rechts|links)\b|\bfrontal\b|\bfrom\s+the\s+front\b|\bfront[- ](?:left|right)\b|\bfront\s+view\b/i
const VIEW_BACK =
  /\bvon\s+hinten\b|\bhinten[- ](?:rechts|links)\b|\bRückenansicht\b|\bfrom\s+behind\b|\bfrom\s+the\s+back\b|\bback[- ](?:left|right)\b|\bback\s+view\b/i

/** «von vorne» oder «von hinten» — nur wenn der Text eindeutig ist, sonst nichts. */
export function cameraViewFromText(text: string | undefined): CameraView | undefined {
  const value = text ?? ''
  const front = VIEW_FRONT.test(value)
  const back = VIEW_BACK.test(value)
  if (front === back) return undefined
  return front ? 'vorne' : 'hinten'
}

function cameraSeenText(seen: unknown): string {
  if (typeof seen === 'string') return seen
  if (!seen || typeof seen !== 'object') return ''
  const camera = (seen as Record<string, unknown>).camera
  return typeof camera === 'string' ? camera : ''
}

/**
 * Widerspricht die eigene Beschreibung der Regie dem Plan bei der Kamera, ist «kamera» nicht bestanden —
 * egal was sie angekreuzt hat. Allgemein: nur «von vorne» gegen «von hinten», oder die Regie sagt selbst «anders».
 */
export function cameraContradictionDe(
  row: Record<string, unknown>,
  plannedViewText?: string,
): string {
  const compare = row.compare && typeof row.compare === 'object' ? (row.compare as Record<string, unknown>) : undefined
  const seenView = cameraViewFromText(cameraSeenText(row.seen)) ?? cameraViewFromText(clip(compare?.seenCamera, 200))
  const plannedView = cameraViewFromText(plannedViewText) ?? cameraViewFromText(clip(compare?.planCamera, 200))
  if (seenView && plannedView && seenView !== plannedView) {
    return `Die Kamera schaut von ${seenView}, geplant war von ${plannedView}.`
  }
  if (compare && passValue(compare.same) === false) {
    const seen = clip(compare.seenCamera, 120)
    const plan = clip(compare.planCamera, 120)
    return seen && plan ? `Kamera anders als geplant: gesehen «${seen}», geplant «${plan}».` : 'Kamera anders als geplant.'
  }
  return ''
}

/** Liest die Antwort der Regie. Fehlt die Prüfliste, gilt das Bild als nicht geprüft — nie still als «passt». */
export function readJudgeAnswer(
  raw: unknown,
  model?: string,
  opts: { plannedViewText?: string; modelNoteDe?: string } = {},
): RegieVerdict {
  const verdict = readJudgeChecks(raw, model, opts.plannedViewText)
  return opts.modelNoteDe ? { ...verdict, modelNoteDe: opts.modelNoteDe } : verdict
}

function readJudgeChecks(raw: unknown, model?: string, plannedViewText?: string): RegieVerdict {
  const row = (Array.isArray(raw) ? raw.find((item) => item && typeof item === 'object') : raw) as
    | Record<string, unknown>
    | undefined
  if (!row || typeof row !== 'object') return uncheckedVerdict('Die Antwort der Regie war leer', model)
  const answered = new Map<string, { pass: boolean; noteDe: string }>()
  const list = row.checks
  if (Array.isArray(list)) {
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const entry = item as Record<string, unknown>
      const id = clip(entry.id, 20).toLowerCase()
      const pass = passValue(entry.pass ?? entry.ok)
      if (!RULE_IDS.has(id) || pass === null || answered.has(id)) continue
      answered.set(id, { pass, noteDe: clip(entry.noteDe ?? entry.note, 200) })
    }
  } else if (list && typeof list === 'object') {
    for (const [key, value] of Object.entries(list as Record<string, unknown>)) {
      const id = key.trim().toLowerCase()
      if (!RULE_IDS.has(id)) continue
      const entry = value && typeof value === 'object' ? (value as Record<string, unknown>) : { pass: value }
      const pass = passValue(entry.pass ?? entry.ok)
      if (pass === null) continue
      answered.set(id, { pass, noteDe: clip(entry.noteDe ?? entry.note, 200) })
    }
  }
  if (answered.size < Math.ceil(REGIE_CHECKS.length / 2)) {
    return uncheckedVerdict('Die Regie hat die Prüfliste nicht ausgefüllt', model)
  }
  const contradiction = cameraContradictionDe(row, plannedViewText)
  let fixEn = clip(row.fixEn, 600)
  if (contradiction && answered.get('kamera')?.pass !== false) {
    answered.set('kamera', { pass: false, noteDe: contradiction })
    fixEn = `${fixEn} CAMERA: paint the view exactly as the plan says (front or back as planned); the last try showed the other side.`.trim()
  }
  const failedRules = REGIE_CHECKS.filter((rule) => answered.get(rule.id)?.pass === false)
  const hard = failedRules.filter((rule) => rule.hard)
  const soft = failedRules.filter((rule) => !rule.hard)
  const noteOf = (rule: RegieCheckRule) => answered.get(rule.id)?.noteDe || `${rule.labelDe} stimmt nicht.`
  const ok = hard.length === 0
  return {
    ok,
    checked: true,
    noteDe: ok ? '' : hard.map(noteOf).join(' ').slice(0, 300),
    fixEn: ok ? '' : fixEn.slice(0, 700),
    freshRefs: !ok && row.freshRefs === true && hard.some((rule) => rule.id === 'ort' || rule.id === 'flaechen'),
    failed: hard.map((rule) => rule.id),
    softDe: soft.map(noteOf).join(' ').slice(0, 200),
    seenDe: seenSummary(row.seen),
    ...(model ? { model } : {}),
  }
}

/** Ergebnis der Regie, wie es beim Bild gespeichert wird. */
export interface StoredRegieCheck {
  ok: boolean
  noteDe: string
  unchecked?: boolean
  failed?: string[]
  softDe?: string
  model?: string
  modelNoteDe?: string
}

export function storedRegieCheck(verdict: RegieVerdict): StoredRegieCheck {
  return {
    ok: verdict.ok,
    noteDe: verdict.noteDe.slice(0, 300),
    ...(verdict.checked ? {} : { unchecked: true }),
    ...(verdict.failed.length ? { failed: verdict.failed } : {}),
    ...(verdict.softDe ? { softDe: verdict.softDe.slice(0, 200) } : {}),
    ...(verdict.model ? { model: verdict.model.slice(0, 60) } : {}),
    ...(verdict.modelNoteDe ? { modelNoteDe: verdict.modelNoteDe.slice(0, 200) } : {}),
  }
}

/** Hat die Regie in diesem Bild wirklich einen Fehler gefunden (nicht nur nicht geprüft)? */
export function regieFoundError(check: StoredRegieCheck | undefined): boolean {
  return Boolean(check && !check.ok && !check.unchecked)
}

/**
 * Taugt ein früheres Bild als Raum-Vorlage? Ein Fehler, der nicht am Raum liegt (Blick, Handlung, Schrift),
 * nimmt das Bild nicht weg. Alte Urteile ohne Liste: wie bisher, Fehler = nicht nehmen.
 */
export function roomRefAllowed(check: StoredRegieCheck | undefined): boolean {
  if (!regieFoundError(check)) return true
  if (!check?.failed?.length) return false
  return !check.failed.some((id) => id === 'ort' || id === 'flaechen')
}

/** Der beste Versuch: wenigste harte Fehler; bei Gleichstand der spätere. Nicht geprüfte Versuche zählen nicht. */
export function bestAttemptIndex(
  attempts: Array<{ verdict?: StoredRegieCheck }> | undefined,
): number {
  let best = -1
  let bestScore = Number.POSITIVE_INFINITY
  ;(attempts ?? []).forEach((attempt, index) => {
    const verdict = attempt.verdict
    if (!verdict || verdict.unchecked) return
    const score = verdict.ok ? 0 : Math.max(1, verdict.failed?.length ?? 1)
    if (score <= bestScore) {
      best = index
      bestScore = score
    }
  })
  return best
}

export type RegieCheckState = 'passt' | 'fehler' | 'ungeprueft' | 'keins'

export function regieCheckState(
  check: (StoredRegieCheck & { stillUrl?: string }) | undefined,
  stillUrl: string | undefined,
  paintedWithRegie: boolean,
): RegieCheckState {
  if (check && check.stillUrl === stillUrl) {
    if (check.unchecked) return 'ungeprueft'
    return check.ok ? 'passt' : 'fehler'
  }
  return stillUrl && paintedWithRegie ? 'ungeprueft' : 'keins'
}

/** Kleine Graustufen-Bilder für den Bildvergleich (Breite × Höhe). */
export const NEAR_COPY_W = 64
export const NEAR_COPY_H = 36

/**
 * Fast dasselbe Bild? Vergleicht zwei kleine Graustufen-Bilder (NEAR_COPY_W × NEAR_COPY_H, Werte 0–255).
 * Fast gleich = im Schnitt kaum Unterschied und nur wenige Stellen deutlich anders.
 */
export function nearCopy(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  const size = NEAR_COPY_W * NEAR_COPY_H
  if (a.length !== size || b.length !== size) return false
  let sum = 0
  let changed = 0
  for (let i = 0; i < size; i++) {
    const diff = Math.abs((a[i] ?? 0) - (b[i] ?? 0))
    sum += diff
    if (diff > 40) changed++
  }
  return sum / size < 10 && changed / size < 0.05
}
