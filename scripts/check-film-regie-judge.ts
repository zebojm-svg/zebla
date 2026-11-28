/**
 * Regie prüft genauer: Prüfliste, «nicht geprüft», Bild im Bild, fast gleiche Bilder, bester Versuch.
 * npx tsx scripts/check-film-regie-judge.ts
 */
import { readFileSync } from 'fs'
import {
  bestAttemptIndex,
  cameraViewFromText,
  nearCopy,
  nearCopyVerdict,
  NEAR_COPY_H,
  NEAR_COPY_W,
  readJudgeAnswer,
  REGIE_CHECKS,
  regieCheckState,
  regieFoundError,
  roomRefAllowed,
  storedRegieCheck,
  uncheckedVerdict,
} from '../shared/film-regie-judge.ts'
import {
  readRegiePlan,
  regiePaintPromptEn,
  regiePlanPlacesDe,
  regiePlanSummaryDe,
  setRegieAttemptVerdict,
} from '../shared/film-regie-plan.ts'
import {
  googleErrorStatus,
  googleRetryDelayMs,
  regieFallbackDe,
  regieModelLineDe,
  regieModelProblem,
} from '../shared/regie-model.ts'
import { stillEditImageErrorDe } from '../shared/film-still-pack.ts'

function fail(message: string): never {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

const allPass = REGIE_CHECKS.map((rule) => ({ id: rule.id, pass: true, noteDe: '' }))
const answer = (changes: Record<string, { pass: boolean | string; noteDe?: string }>, extra: Record<string, unknown> = {}) => ({
  seen: { people: 'eine Frau am Tisch', bodyParts: 'zwei Hände (ihre)' },
  checks: allPass.map((check) => (changes[check.id] ? { id: check.id, ...changes[check.id] } : check)),
  fixEn: 'Remove the extra feet.',
  ...extra,
})

// Prüfliste
{
  const ok = readJudgeAnswer(answer({}), 'gemini-2.5-pro')
  if (!ok.ok || !ok.checked || ok.model !== 'gemini-2.5-pro' || ok.fixEn) fail('alle Prüfungen bestanden = passt, Modell steht dabei')
  if (!ok.seenDe.includes('eine Frau am Tisch')) fail('was die Regie gesehen hat, wird kurz behalten')

  const feet = readJudgeAnswer(answer({ koerper: { pass: false, noteDe: 'Fremde Füsse auf dem Tisch.' } }))
  if (feet.ok || !feet.checked || feet.failed.join() !== 'koerper') fail('ein harter Fehler: nicht ok, mit Namen der Prüfung')
  if (feet.noteDe !== 'Fremde Füsse auf dem Tisch.' || feet.fixEn !== 'Remove the extra feet.') fail('Satz für Jean-Marie und Auftrag an den Maler')

  const letters = readJudgeAnswer(answer({ schrift: { pass: false, noteDe: 'Schrift auf der Tafel unlesbar.' } }))
  if (!letters.ok || letters.softDe !== 'Schrift auf der Tafel unlesbar.' || letters.failed.length) {
    fail('Schrift ist ein weicher Punkt: passt trotzdem, steht aber da, kein Neumalen')
  }

  const words = readJudgeAnswer(answer({ handlung: { pass: 'nein' } }))
  if (words.ok || !words.noteDe.includes('Handlung')) fail('«nein» zählt als nicht bestanden, ohne Satz gibt es einen Ersatz-Satz')

  const asMap = readJudgeAnswer({ checks: Object.fromEntries(REGIE_CHECKS.map((rule) => [rule.id, rule.id === 'neu' ? { pass: false } : true])) })
  if (asMap.ok || asMap.failed.join() !== 'neu') fail('die Prüfliste darf auch als Objekt kommen')

  const half = readJudgeAnswer({ checks: allPass.slice(0, 3) })
  if (half.checked || half.ok || !half.noteDe.startsWith('Nicht geprüft')) fail('eine halbe Prüfliste heisst «nicht geprüft», nie still «passt»')
  if (readJudgeAnswer({ ok: true }).checked) fail('die alte Antwort { ok: true } ohne Prüfliste gilt nicht als geprüft')
  if (readJudgeAnswer(null).checked) fail('eine leere Antwort ist nicht geprüft')

  const roomWrong = readJudgeAnswer(answer({ ort: { pass: false } }, { freshRefs: true }))
  if (!roomWrong.freshRefs) fail('falscher Raum: nächster Versuch ohne die falschen Bilder')
  if (readJudgeAnswer(answer({ blick: { pass: false } }, { freshRefs: true })).freshRefs) {
    fail('Blick falsch: die Vorlagen bleiben (freshRefs nur bei Raum oder Fläche)')
  }
  for (const id of ['personen', 'koerper', 'aussehen', 'ort', 'flaechen', 'handlung', 'kamera', 'blick', 'neu']) {
    if (!REGIE_CHECKS.find((rule) => rule.id === id)?.hard) fail(`«${id}» ist ein harter Fehler`)
  }
  if (REGIE_CHECKS.find((rule) => rule.id === 'schrift')?.hard) fail('Schrift ist weich')
  const askAll = REGIE_CHECKS.map((rule) => rule.askDe).join(' ')
  if (/videochat|laptop|webcam|headset|fussball|ente\b/i.test(askAll)) fail('die Prüfliste kennt keine bestimmten Lagen')
}

// nicht geprüft, Raum-Vorlage, bester Versuch
{
  const none = uncheckedVerdict('Zeitlimit.')
  if (none.ok || none.checked || none.noteDe !== 'Nicht geprüft: Zeitlimit.') fail('nicht geprüft hat einen deutschen Grund')
  const stored = storedRegieCheck(none)
  if (!stored.unchecked || regieFoundError(stored)) fail('nicht geprüft ist kein Fehler im Bild')
  if (!roomRefAllowed(stored)) fail('ein nicht geprüftes Bild darf Raum-Vorlage bleiben')
  if (!roomRefAllowed({ ok: false, noteDe: 'Blick', failed: ['blick'] })) fail('Fehler nicht am Raum: Bild bleibt Raum-Vorlage')
  if (roomRefAllowed({ ok: false, noteDe: 'Raum', failed: ['ort', 'blick'] })) fail('Fehler am Raum: keine Raum-Vorlage')
  if (roomRefAllowed({ ok: false, noteDe: 'alt' })) fail('altes Urteil ohne Liste: wie bisher keine Vorlage')

  const at = (verdict?: Parameters<typeof bestAttemptIndex>[0] extends Array<infer A> | undefined ? A['verdict'] : never) => ({ verdict })
  if (bestAttemptIndex([at({ ok: false, noteDe: '', failed: ['ort', 'blick'] }), at({ ok: false, noteDe: '', failed: ['blick'] }), at({ ok: false, noteDe: '', failed: ['ort', 'kamera'] })]) !== 1) {
    fail('bester Versuch = wenigste harte Fehler')
  }
  if (bestAttemptIndex([at({ ok: false, noteDe: '', failed: ['blick'] }), at({ ok: false, noteDe: '', failed: ['kamera'] })]) !== 1) {
    fail('bei Gleichstand gilt der spätere Versuch')
  }
  if (bestAttemptIndex([at({ ok: true, noteDe: '' }), at({ ok: false, noteDe: '', unchecked: true }), at()]) !== 0) {
    fail('nicht geprüfte Versuche zählen nicht')
  }
  if (bestAttemptIndex([]) !== -1) fail('ohne Versuche gibt es keinen besten')

  const url = 'https://example.com/a.png'
  if (regieCheckState({ ok: false, noteDe: 'x', unchecked: true, stillUrl: url }, url, true) !== 'ungeprueft') fail('Zustand: nicht geprüft')
  if (regieCheckState(undefined, url, true) !== 'ungeprueft') fail('gemalt mit Regie, aber nie angeschaut = nicht geprüft')
  if (regieCheckState({ ok: true, noteDe: '', stillUrl: 'https://example.com/old.png' }, url, false) !== 'keins') fail('Urteil zu einem alten Bild gilt nicht')
  if (regieCheckState({ ok: true, noteDe: '', stillUrl: url }, url, true) !== 'passt') fail('Zustand: passt')

  const attempts = setRegieAttemptVerdict([{ stillUrl: url, at: 't', planned: true }], url, {
    ...storedRegieCheck(readJudgeAnswer(answer({ kamera: { pass: false, noteDe: 'Von der Seite statt von vorne.' } }), 'gemini-2.5-pro')),
    seenDe: 'Frau von der Seite',
  })
  const v = attempts?.[0]?.verdict
  if (!v || v.failed?.join() !== 'kamera' || v.model !== 'gemini-2.5-pro' || v.seenDe !== 'Frau von der Seite') {
    fail('der Versuch behält Fehlerliste, Modell und was die Regie sah')
  }
  if (!nearCopyVerdict().failed.includes('neu') || nearCopyVerdict().ok) fail('fast gleiches Bild = Fehler «neu», ohne KI')
}

// fast gleiche Bilder
{
  const size = NEAR_COPY_W * NEAR_COPY_H
  const base = new Uint8Array(size)
  for (let i = 0; i < size; i++) base[i] = (i * 37) % 256
  const noisy = base.map((value, i) => Math.max(0, Math.min(255, value + ((i % 7) - 3))))
  if (!nearCopy(base, noisy)) fail('fast dasselbe Bild wird erkannt')
  const face = new Uint8Array(base)
  for (let i = 0; i < 60; i++) face[i * 13] = 255 - face[i * 13]!
  if (!nearCopy(base, face)) fail('nur der Gesichtsausdruck anders: immer noch fast gleich')
  const other = base.map((_, i) => ((i % NEAR_COPY_W) * 4) % 256)
  if (nearCopy(base, other)) fail('ein anderes Bild ist keine Kopie')
  const moved = new Uint8Array(size)
  for (let i = 0; i < size; i++) moved[i] = base[(i + 9) % size]!
  if (nearCopy(base, moved)) fail('anderer Bildaufbau ist keine Kopie')
  if (nearCopy(base, base.slice(0, 10))) fail('falsche Grösse: kein Urteil')
}

// Bild im Bild, allgemein (Fussballplatz, Spiegel)
{
  const opts = {
    places: ['Stadion', 'Garderobe'],
    people: ['Mia', 'Trainer'],
    options: [{ id: 'V1', url: 'https://example.com/mia.png', aboutDe: 'Stammbild von Mia' }],
  }
  const read = readRegiePlan(
    {
      place: 'stadion',
      bodies: ['Mia'],
      screens: [],
      surfaces: [
        { thing: 'Anzeigetafel', people: ['Trainer', 'Mia'], place: 'garderobe', showsEn: 'the coach talking, live picture' },
        { thing: 'Spiegel', people: [], place: '', showsEn: '' },
        { thing: 'Handy', showsEn: 'a text message' },
      ],
      cameraDe: 'Von hinten auf Mia, sie schaut zur Tafel.',
      cameraEn: 'Camera behind Mia at pitch level, looking up at the scoreboard; Mia looks at the scoreboard.',
      sameFraming: false,
      paintEn: 'Mia on the pitch looking at the scoreboard.',
      refs: [{ id: 'V1', useEn: "Mia's face only" }],
    },
    opts,
  )
  const plan = read.plan
  if (!plan) fail(`Plan mit Flächen wird gelesen: ${read.errorDe}`)
  if (plan.place !== 'Stadion') fail('Ort der Kamera aus dem Regiebuch')
  if (plan.surfaces?.length !== 2) fail('leere Flächen fallen weg, echte bleiben')
  const board = plan.surfaces[0]!
  if (board.place !== 'Garderobe' || board.people.join() !== 'Trainer') fail('Fläche: Ort aus dem Regiebuch, wer im Raum ist, nicht zusätzlich darauf')
  if (plan.screens.join() !== 'Trainer') fail('wer auf einer Fläche ist, zählt als «nur auf Bildschirm»')
  if (!plan.cameraEn?.includes('scoreboard') || plan.sameFraming) fail('Kamera-Satz englisch und «gleicher Blick» gehen mit')
  const paint = regiePaintPromptEn({
    plan,
    continuity: {
      situationDe: '',
      situationEn: '',
      together: true,
      people: [{ name: 'Mia', lookEn: 'girl, red jersey' }, { name: 'Trainer', lookEn: 'man, grey tracksuit' }],
      places: [{ name: 'Stadion', lookEn: 'green pitch, white lines' }, { name: 'Garderobe', lookEn: 'blue lockers, wooden bench' }],
      locksEn: [],
      shots: [],
    },
    styleLabel: 'Filmzeichnung',
    stylePrompt: 'ink',
    languageEn: 'German',
  })
  if (!paint.includes('PICTURE ON Anzeigetafel') || !paint.includes('blue lockers') || !paint.includes('The room around Anzeigetafel stays Stadion')) {
    fail('der Maler weiss: auf der Tafel die Garderobe, rund herum das Stadion')
  }
  if (!paint.includes('room the camera stands in') || !paint.includes('green pitch')) fail('der Ort der Kamera ist klar benannt')
  if (!paint.includes('not even partly') || !paint.includes('only inside their device or frame')) {
    fail('genau die Leute, keine halben Körper, Bilder nur in ihrem Rahmen')
  }
  const lastLine = paint.trim().split('\n').pop() ?? ''
  if (!lastLine.startsWith('CAMERA AND GAZE') || !lastLine.includes('looks at the scoreboard')) fail('Kamera und Blick stehen am Schluss noch einmal')
  if (paint.includes('Seen only on a screen')) fail('mit Flächen kein zusätzlicher alter Bildschirm-Satz für dieselben Leute')
  const fixed = paint.replace(/Anzeigetafel|Spiegel|Mia|Trainer|Stadion|Garderobe/g, '')
  if (/video|laptop|webcam|tea|duck|ente/i.test(fixed.replace(plan.paintEn, '').replace(plan.cameraEn ?? '', '').replace(/the coach talking, live picture|a text message/g, ''))) {
    fail('der Maler-Auftrag hat keine Regeln für bestimmte Lagen')
  }
  const summary = regiePlanSummaryDe(plan)
  if (!summary.includes('Ort der Kamera Stadion') || !summary.includes('auf Anzeigetafel: Trainer vor Ort Garderobe')) fail('Kurzfassung nennt Kamera-Ort und Flächen')
  const note = regiePlanPlacesDe(plan)
  if (!note.startsWith('Ort: Stadion.') || !note.includes('Auf Anzeigetafel: Trainer (Garderobe).')) fail('Notiz unter dem Bild: Ort und Flächen')

  const old = readRegiePlan({ place: 'Stadion', bodies: ['Mia'], screens: ['Trainer'], cameraDe: 'a', paintEn: 'b' }, opts).plan
  if (!old || old.surfaces || old.screens.join() !== 'Trainer') fail('alte Pläne ohne Flächen gehen weiter')
  if (!regiePaintPromptEn({ plan: old, styleLabel: 'x', stylePrompt: 'y', languageEn: 'German' }).includes('Seen only on a screen, not as a body in the room: Trainer')) {
    fail('alter Plan: Bildschirm-Satz wie bisher')
  }
  if (regiePlanPlacesDe(old) !== 'Ort: Stadion. Nur auf einem Bildschirm: Trainer.') fail('alter Plan: Notiz mit Ort und Bildschirm')

  const handy = readRegiePlan(
    {
      place: 'Stadion',
      bodies: ['Mia'],
      surfaces: [{ thing: 'Handy', people: [], place: '', showsEn: 'a text message from the coach', contentDe: 'eine Nachricht vom Trainer' }],
      cameraDe: 'a',
      paintEn: 'b',
    },
    opts,
  ).plan
  if (handy?.surfaces?.[0]?.contentDe !== 'eine Nachricht vom Trainer') fail('Fläche: deutscher Satz für die Seite wird gelesen')
  if (regiePlanPlacesDe(handy) !== 'Ort: Stadion. Auf Handy: eine Nachricht vom Trainer.') fail('Seite zeigt deutsch, nicht den englischen Maler-Text')
  if (!regiePaintPromptEn({ plan: handy, styleLabel: 'x', stylePrompt: 'y', languageEn: 'German' }).includes('a text message from the coach')) {
    fail('der Maler bekommt weiter den englischen Text')
  }
  const oldSurface = { ...handy, surfaces: [{ thing: 'Handy', people: [], place: '', showsEn: 'a text message' }] }
  if (/text message/.test(regiePlanPlacesDe(oldSurface))) fail('alter Plan ohne deutschen Satz: kein Englisch auf der Seite')
}

// Kamera: Beschreibung gegen Plan
{
  if (cameraViewFromText('Lena von hinten-rechts gesehen') !== 'hinten') fail('«von hinten-rechts» ist hinten')
  if (cameraViewFromText('Halbnah auf Lena, von vorne-rechts.') !== 'vorne') fail('«von vorne-rechts» ist vorne')
  if (cameraViewFromText('Camera behind Mia, from behind') !== 'hinten') fail('englisch «from behind» ist hinten')
  if (cameraViewFromText('von vorne auf Mia, Tor hinten von hinten beleuchtet') !== undefined) fail('beides im Text: keine Entscheidung')
  if (cameraViewFromText('über die Schulter') !== undefined) fail('unklar: keine Entscheidung')

  const back = readJudgeAnswer(
    answer({}, { seen: { camera: 'Lena von hinten-rechts gesehen, halbnah' } }),
    'gemini-2.5-pro',
    { plannedViewText: 'Halbnah auf Lena, von vorne-rechts.' },
  )
  if (back.ok || !back.failed.includes('kamera') || !back.noteDe.includes('von hinten') || !back.fixEn.includes('CAMERA')) {
    fail('Beschreibung «von hinten», Plan «von vorne»: Kamera nicht bestanden, auch wenn die Regie «passt» angekreuzt hat')
  }
  const same = readJudgeAnswer(answer({}, { seen: { camera: 'von vorne' } }), 'm', { plannedViewText: 'von vorne-links' })
  if (!same.ok) fail('gleiche Seite: passt')
  const told = readJudgeAnswer(
    answer({}, { compare: { planCamera: 'von der Seite', seenCamera: 'von oben', same: false } }),
    'm',
  )
  if (told.ok || !told.failed.includes('kamera') || !told.noteDe.includes('von oben')) fail('sagt die Regie selbst «anders», ist Kamera nicht bestanden')
  const noPlan = readJudgeAnswer(answer({}, { seen: { camera: 'von hinten' } }), 'm', {})
  if (!noPlan.ok) fail('ohne Kamera im Plan kein Zwang')
  const noted = readJudgeAnswer(answer({}), 'gemini-2.5-flash', { modelNoteDe: 'Flash statt Pro, weil …' })
  if (storedRegieCheck(noted).modelNoteDe !== 'Flash statt Pro, weil …') fail('der Grund für Flash wird beim Bild gespeichert')
}

// Modell: nur bei «gibt es nicht» auf Flash, bei Überlastung noch einmal Pro
{
  const notFound =
    '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent: [404 Not Found] models/gemini-2.5-pro is not found for API version v1beta'
  if (regieModelProblem(notFound) !== 'missing' || googleErrorStatus(notFound) !== 404) fail('404 = Modell fehlt')
  const busy = '[GoogleGenerativeAI Error]: Error fetching from https://x: [503 Service Unavailable] The model is overloaded. Please try again later.'
  if (regieModelProblem(busy) !== 'busy') fail('503 überlastet = noch einmal Pro, nicht Flash')
  const quota = '[429 Too Many Requests] You exceeded your current quota. Please retry in 7.5s.'
  if (regieModelProblem(quota) !== 'busy' || googleRetryDelayMs(quota) !== 7500) fail('429 = warten (so lange wie Google sagt), noch einmal Pro')
  const none = '[429 Too Many Requests] Quota exceeded for metric: generate_content_free_tier_requests, limit: 0, model: gemini-2.5-pro'
  if (regieModelProblem(none) !== 'no-quota') fail('Kontingent 0 = Pro steht dem Schlüssel nicht zur Verfügung')
  if (regieModelProblem('Die Regie hat das Bild nicht rechtzeitig angeschaut') !== 'other') fail('Zeitlimit ist kein Grund für Flash')
  if (regieModelProblem('Gemini-Modell „gemini-2.5-pro“ ist nicht verfügbar.') !== 'other') {
    fail('unsere eigene deutsche Meldung zählt nicht als «Modell fehlt»')
  }
  const why = regieFallbackDe('missing', 'gemini-2.5-pro', 'gemini-2.5-flash', 404)
  if (!why.startsWith('Flash statt Pro, weil') || !why.includes('404')) fail('Grund: «Flash statt Pro, weil …»')
  if (regieModelLineDe('gemini-2.5-flash', why) !== `Modell: gemini-2.5-flash — ${why}`) fail('Verlauf zeigt Modell und Grund')

  const ai = readFileSync('lib/ai.ts', 'utf8')
  const fn = ai.slice(ai.indexOf('export async function regieJsonWithModel'), ai.indexOf('export async function regieModelHealth'))
  if (!fn.includes('chatJsonRaw') || fn.includes('isGeminiModelMissing')) fail('Regie entscheidet an der Original-Meldung von Google')
  if (!fn.includes("problem === 'busy'") && !fn.includes("problem !== 'busy'")) fail('Überlastung: noch einmal Pro')
  if (!fn.includes('REGIE_RETRY_MIN_LEFT_MS')) fail('neuer Versuch nur, wenn die Zeit reicht')
  const plan = readFileSync('lib/film-regie-plan.ts', 'utf8')
  if (!plan.includes('regieJsonWithModel') || !plan.includes('modelNoteDe')) fail('der Plan merkt sich Modell und Grund')
  const cont = readFileSync('lib/film-continuity.ts', 'utf8')
  if (!cont.includes('readModel: read.model')) fail('das Regiebuch merkt sich, wer gelesen hat')
}

// Bild ändern: Grund auf Deutsch
{
  const reasons: Array<[string, RegExp]> = [
    ['FLUX Kontext nicht gelungen (Replicate FLUX Kontext: Request was throttled. Your rate limit is reduced).', /zu oft gefragt/],
    ['Replicate FLUX Kontext: Prediction failed: The input or output was flagged as sensitive (E005)', /Schutzfilter/],
    ['[200] Kein Standbild erhalten.', /kein Bild zurückgegeben/],
    ['Failed to fetch', /Verbindung/],
    ['Something odd happened in the painter', /Grund: Something odd happened in the painter/],
  ]
  for (const [raw, want] of reasons) {
    const shown = stillEditImageErrorDe(new Error(raw))
    if (!want.test(shown) || !shown.includes('Das Bild konnte nicht neu gemalt werden')) fail(`Bild ändern nennt den Grund: ${raw} → ${shown}`)
    if (stillEditImageErrorDe(new Error(shown)) !== shown) fail(`zweimal übersetzt bleibt derselbe Satz: ${shown}`)
  }
}

// Quelltext: Anschauen, Planen, Malen, Schleife, Seite
{
  const cont = readFileSync('lib/film-continuity.ts', 'utf8')
  const judgeFn = cont.slice(cont.indexOf('export async function judgeStoryStill'), cont.indexOf('async function samePerson'))
  if (/return pass\b|REGIE_PASS/.test(judgeFn)) fail('Anschauen gibt bei Fehlern nie still «passt» zurück')
  if (!judgeFn.includes("uncheckedVerdict('Das Bild konnte nicht geladen werden')") || !judgeFn.includes('catch (err)')) {
    fail('fehlt das Bild oder klappt die Anfrage nicht: «nicht geprüft»')
  }
  if (!judgeFn.includes('regieJsonWithModel') || !judgeFn.includes('readJudgeAnswer(value, model, { plannedViewText: opts.plannedCameraText, modelNoteDe: noteDe })')) fail('das Modell steht beim Urteil')
  for (const need of ['SATZ DAVOR', 'SATZ DANACH', 'AUFTRAG AN DEN MALER', 'JUDGE_REF_WIDTH']) {
    if (!judgeFn.includes(need)) fail(`Anschauen bekommt ${need}`)
  }
  const judgePrompt = cont.slice(cont.indexOf('const JUDGE'), cont.indexOf('export const JUDGE_TIMEOUT_MS'))
  if (!judgePrompt.includes('SCHRITT 1') || !judgePrompt.includes('bodyParts') || !judgePrompt.includes('REGIE_CHECKS.map')) {
    fail('zuerst beschreiben, dann jede Prüfung einzeln')
  }
  if (/videochat|laptop|webcam|headset/i.test(judgePrompt)) fail('der Prüf-Text kennt keine bestimmten Lagen')
  const timeout = Number(/JUDGE_TIMEOUT_MS = ([\d_]+)/.exec(cont)?.[1]?.replace(/_/g, ''))
  if (!(timeout > 60_000 && timeout <= 120_000)) fail('Anschauen bleibt mit Laden und Speichern unter 180 s')
  if (!/JUDGE_MAX_REFS = [4-6]\b/.test(cont)) fail('höchstens 6 Vergleichsbilder')

  const board = readFileSync('lib/film-storyboard.ts', 'utf8')
  const judgeFn2 = board.slice(board.indexOf('export async function judgeFilmPanel'), board.indexOf('/** Höchstens zwei gutgeheissene Bilder'))
  for (const need of ['Voriges Bild', 'Raum-Vorlage', 'Stammbild von', 'plan.surfaces', 'roomRefAllowed', 'pickBest', 'bestAttemptIndex', 'nearCopyOfUrl', 'paintEn: plan?.paintEn']) {
    if (!judgeFn2.includes(need)) fail(`Anschauen: ${need}`)
  }
  if (!/who\.slice\(0, 3\)/.test(judgeFn2)) fail('Stammbilder aller Leute im Bild, höchstens drei')
  const stillFn = board.slice(board.indexOf('export async function stillFilmPanel'), board.indexOf('export async function saveFilmPlan'))
  if (judgeFn.includes('nearCopyVerdict()')) fail('fast gleiches Bild: die Regie entscheidet, nicht automatisch')
  if (!stillFn.includes('compareUrls') || !stillFn.includes('painted.copyOf') || !stillFn.includes('ref.url !== copied')) {
    fail('nach dem Malen: Bildvergleich, und beim nächsten Versuch ohne das kopierte Bild')
  }
  if (!stillFn.includes('plan.sameFraming')) fail('will der Plan denselben Blick, gibt es keinen Kopie-Alarm')

  const painter = readFileSync('lib/film-stills.ts', 'utf8')
  const planned = painter.slice(painter.indexOf('export async function paintRegiePlannedStill'))
  if (!planned.includes('grayThumb') || !planned.includes('nearCopy(mine, thumb)')) fail('der Maler-Schritt vergleicht mit früheren Bildern')

  const planSrc = readFileSync('lib/film-regie-plan.ts', 'utf8')
  if (!planSrc.includes('regieJsonWithModel<unknown>(PLAN, ask, images') || !planSrc.includes('PLAN_THUMB_WIDTH')) fail('die Regie sieht kleine Bilder der Vorlagen')
  if (!planSrc.includes('do not copy pose or framing') || !planSrc.includes('sameFraming') || !planSrc.includes('surfaces')) {
    fail('Planen: Flächen, gleicher Blick, voriges Bild nicht als Bildaufbau')
  }
  if (/video|laptop|webcam|ente|duck/i.test(planSrc)) fail('die Plan-Regie hat keine Regeln für bestimmte Lagen')

  const loop = readFileSync('src/story/generateSceneStills.ts', 'utf8')
  if (!loop.includes('verdict.checked') || !loop.includes('judgeRetried') || !loop.includes('filmJudge(opts.dialogId, opts.panelId, last)')) {
    fail('nicht geprüft: kein Neumalen, einmal neu anschauen; am Schluss bester Versuch')
  }
  const ui = readFileSync('src/story/FilmSceneGenerate.tsx', 'utf8')
  if (!ui.includes('Regie: nicht geprüft.') || !ui.includes('alert alert-info') || !ui.includes('Kleinigkeit')) {
    fail('die Seite zeigt «nicht geprüft» anders als «passt», und Kleinigkeiten')
  }
  if (!ui.includes('regiePlanPlacesDe')) fail('die Notiz unter dem Bild nennt Ort und Flächen')
  const page = readFileSync('src/story/FilmStoryboardPage.tsx', 'utf8')
  if (!page.includes('<FilmRegieCheckNote panel={panel} />')) fail('Bilder-Seite zeigt das Urteil mit derselben Notiz')
}

console.log('OK film-regie-judge')
