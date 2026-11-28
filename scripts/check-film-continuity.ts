/**
 * Regie liest die Geschichte einmal. Der Satz geht mit jedem Bild.
 * Aufruf: npx tsx scripts/check-film-continuity.ts
 */
import { readFileSync } from 'node:fs'
import { buildFilmStillPrompt } from '../shared/film-stills.ts'
import { DEFAULT_STORY_ART_STYLE, paintingStyleId } from '../shared/story-art-styles.ts'
import { pickedCastUrl } from '../shared/catalog-cast.ts'
import { normalizeFilmStoryboard, type FilmStoryboard } from '../shared/film-storyboard.ts'
import { paintingStyleText } from '../lib/ken-burns-style.ts'
import {
  continuityBriefEn,
  continuityProblemDe,
  continuitySourceKey,
  directorStillUrls,
  isRegieReading,
  placeForName,
  placesTooAlike,
  tidyContinuity,
  fallbackContinuity,
  fallbackShots,
  referenceJobs,
  regiebuchFromContinuity,
  regiebuchVorgabenDe,
  sanitizeContinuity,
  sanitizeRegiebuchEdit,
} from '../shared/film-continuity.ts'
import {
  regieAttachmentLegendEn,
  regiePaintPromptEn,
  readRegiePlan,
  regiePlanErrorLineDe,
  regiePlanSummaryDe,
  sanitizeRegiePlan,
} from '../shared/film-regie-plan.ts'

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

const text = 'Lena und Amir trinken Tee in der Küche.'
const key = continuitySourceKey(text)
if (continuitySourceKey(text) !== key) fail('derselbe Text, derselbe Schlüssel')
if (continuitySourceKey(`${text} noch ein Satz`) === key) fail('neuer Text, neuer Schlüssel')

const room = fallbackContinuity({ text, people: ['Lena', 'Amir'], places: ['Küche'] })
if (!room.together) fail('Tee in der Küche ist kein Videogespräch')
if (!continuityBriefEn(room).includes('FORBIDDEN: video call')) fail('Regie verbietet das Videogespräch')

const call = fallbackContinuity({
  text: 'Lena und Amir sind per Videogespräch verbunden.',
  people: ['Lena'],
  places: [],
})
if (call.together) fail('Videogespräch bleibt getrennt')
if (continuityBriefEn(call).toLowerCase().includes('forbidden: video call')) {
  fail('ein echtes Videogespräch wird nicht verboten')
}

const clean = sanitizeContinuity(
  {
    situationDe: 'Sie sitzen zusammen in der Küche.',
    situationEn: 'They sit together in the kitchen.',
    together: true,
    people: [{ name: 'Lena', lookEn: 'short dark hair, green coat' }],
    places: [{ name: 'Küche', lookEn: 'gas stove' }],
    locksEn: ['green coat stays'],
  },
  text,
)
if (!clean || clean.people[0]?.lookEn !== 'short dark hair, green coat') fail('Regie-Satz wird übernommen')
if (sanitizeContinuity({ situationDe: '' }, text)) fail('leere Regie gilt nicht')

const prompt = buildFilmStillPrompt({
  caption: 'Lena: Hallo.',
  settingHint: 'Küche',
  hasLibraryRefs: false,
  shot: 'closeup',
  closeupSpeaker: 'Lena',
  continuityBriefEn: continuityBriefEn(room),
})
if (!prompt.includes('CONTINUITY')) fail('die Bild-KI bekommt die Regie')
if (!prompt.includes('green coat') && !prompt.includes('FORBIDDEN: video call')) {
  fail('die Lage steht im Bild-Auftrag')
}

const shots = fallbackShots([
  { id: 'weit', shot: 'wide', settingHint: 'Küche' },
  { id: 'nah', shot: 'closeup', settingHint: 'Küche', closeupSpeaker: 'Lena' },
  { id: 'nah2', shot: 'closeup', settingHint: 'Küche', closeupSpeaker: 'Lena' },
])
if (!shots[1]?.sendViewKeys.includes('küche|weit')) fail('die Nahaufnahme bekommt den weiten Blick')
if (!shots[2]?.sendViewKeys.some((key) => key.includes('|nah|'))) {
  fail('der zweite gleiche Blick bekommt das erste Bild dieses Blicks')
}
const urls = directorStillUrls(
  [
    { id: 'weit', stillUrl: 'https://example.com/weit.png' },
    { id: 'nah' },
  ],
  { ...room, shots },
  'nah',
)
if (urls[0]?.url !== 'https://example.com/weit.png') fail('das frühere Bild wird mitgeschickt')

const jobs = referenceJobs({
  continuity: room,
  hasFront: () => false,
  hasSide: () => false,
  hasPlace: () => false,
})
if (jobs[0]?.kind !== 'person-front') fail('zuerst das Stammbild, dann die Seitenansicht')
const jobs2 = referenceJobs({
  continuity: room,
  hasFront: () => true,
  portraitAsset: () => ({ url: 'https://example.com/x.png', description: 'green t-shirt' }),
  hasSide: () => false,
  hasPlace: () => false,
})
if (!jobs2.some((job) => job.kind === 'person-front-check')) {
  fail('hat ein Stammbild, aber andere Kleidung im Text: Regie vergleicht zuerst')
}
if (!jobs.some((job) => job.kind === 'place')) fail('der Raum wird als Referenz geplant')
if (DEFAULT_STORY_ART_STYLE !== 'filmzeichnung') fail('der Zeichenstil ist die Filmzeichnung')
if (!paintingStyleText('photoreal').includes('animated-film')) fail('ohne bewusste Foto-Wahl wird gezeichnet')
if (!paintingStyleText('photoreal', 'photoreal').includes('Photorealistic')) fail('bewusste Foto-Wahl bleibt ein Foto')
if (paintingStyleId('') !== 'filmzeichnung') fail('ohne Wahl gilt die Filmzeichnung')
if (paintingStyleId('illustration-lebendig') !== 'illustration-lebendig') fail('eine gewählte Illustration bleibt')
if (paintingStyleId('comic') !== 'comic') fail('Comic bleibt Comic')
if (
  pickedCastUrl(
    [{ id: 'lena', name: 'Lena', imageUrl: 'https://example.com/lena.png' }],
    ['lena'],
    'Lena sitzt',
  ) !== 'https://example.com/lena.png'
) {
  fail('eine gewählte Person mit demselben Namen wird genommen')
}
if (pickedCastUrl([{ id: 'kueche', name: 'Wohnzimmer', imageUrl: 'https://example.com/room.png' }], ['kueche'], 'Küche')) {
  fail('ein anderer Raum wird nicht genommen')
}

const src = readFileSync(new URL('../lib/film-storyboard.ts', import.meta.url), 'utf8')
const fn = src.slice(src.indexOf('export async function stillFilmPanel'), src.indexOf('export async function saveFilmPlan'))
if (!fn.includes('ensureFilmContinuity')) fail('vor dem Bild liest die Regie die Geschichte')
if (!fn.includes('ensureSpeakerPlate')) fail('fehlendes Gesicht wird einmal gezeichnet')
if (!fn.includes('continuityBriefEn')) fail('der Regie-Satz geht ans Bild')
if (!fn.includes('directorStillUrls')) fail('frühere Blicke gehen mit dem Bild')
if (!src.includes('prepareFilmReferences')) fail('Referenzen entstehen vor den Szenenbildern')
if (!src.includes('runNextReferenceJob')) fail('ein Referenzbild nach dem anderen')

const read = sanitizeContinuity(
  {
    situationDe: 'Zwei Räume, Videogespräch.',
    situationEn: 'Video call, two rooms.',
    together: false,
    people: [{ name: 'Amir', lookEn: 'man, headset', lookDe: 'Mann mit Headset' }],
    places: [{ name: 'Büro', lookEn: 'small office', lookDe: 'kleines Büro' }],
    locksEn: [],
    shots: [],
  },
  'x',
)
if (read?.people[0]?.lookDe !== 'Mann mit Headset') fail('Regiebuch behält das Deutsche der Regie')
const book = regiebuchFromContinuity({ ...read!, notesDe: ['Amir trägt immer das Headset.'] })
const vorgaben = regiebuchVorgabenDe(book)
if (!vorgaben.includes('Amir: Mann mit Headset') || !vorgaben.includes('Gilt: Amir trägt immer das Headset.')) {
  fail('Vorgaben aus dem Regiebuch gehen an die Regie')
}
if (sanitizeRegiebuchEdit({ people: [{ name: '' }] })?.people.length !== 0) fail('leere Namen fallen weg')
const contSrc = readFileSync('lib/film-continuity.ts', 'utf8')
if (!contSrc.includes('person-front-check') || !contSrc.includes('judgePortraitPlate')) {
  fail('Stammbild wird mit Regiebuch verglichen, bei Abweichung neu gezeichnet')
}
if (!src.includes('redrawSpeakerPortrait')) fail('im Regiebuch kann man das Stammbild neu zeichnen')
if (!readFileSync('shared/film-portrait-plate.ts', 'utf8').includes('portraitPaintUrl')) {
  fail('an den Maler geht nur ein geprüftes Stammbild')
}
const printUi = readFileSync('src/story/FilmStoryboardPrintPage.tsx', 'utf8')
if (!printUi.includes('window.print') || !printUi.includes('film-print-figure')) {
  fail('Druckansicht: Bilder ganz, ein Dokument')
}
if (!contSrc.includes('VORGABEN VON JEAN-MARIE')) fail('Regie liest Jean-Maries Änderungen als Vorgabe')
const boardSrc = readFileSync('lib/film-storyboard.ts', 'utf8')
if (!boardSrc.includes('carry?.byUser')) fail('«Bilder planen» löscht das geänderte Regiebuch nicht')

if (!contSrc.includes('aus jeder Richtung zeichnen')) fail('Orte im Regiebuch sagen, was an welcher Wand ist')
if (!contSrc.includes('gegenüberliegende Wand')) fail('Gegenschuss zeigt die andere Wand (Regie-Satz, kein Code)')
if (!readFileSync('shared/film-regie-judge.ts', 'utf8').includes('posieren nicht')) fail('die Regie prüft, dass niemand für den Zuschauer posiert')

const options = [
  { id: 'V1', url: 'https://example.com/lena.png', aboutDe: 'Stammbild von Lena' },
  { id: 'V2', url: 'https://example.com/bild1.png', aboutDe: 'Früheres Bild 1' },
]
const plan = sanitizeRegiePlan(
  {
    place: 'lenas zimmer',
    bodies: ['Lena', 'Fremder'],
    screens: ['Amir', 'Lena'],
    cameraDe: 'Über Lenas Schulter.',
    paintEn: 'Lena at her desk, camera behind her right shoulder.',
    refs: [
      { id: 'V1', useEn: "Lena's face and clothes only" },
      { id: 'V9', useEn: 'unknown' },
      { id: 'V2', useEn: 'same room, opposite wall' },
      { id: 'V1', useEn: 'twice' },
    ],
  },
  { places: ['Lenas Zimmer', 'Amirs Zimmer'], people: ['Lena', 'Amir'], options },
)
if (!plan) fail('ein Plan der Regie wird übernommen')
if (plan.place !== 'Lenas Zimmer') fail('der Ort ist ein Ort aus dem Regiebuch')
if (plan.bodies.join() !== 'Lena') fail('nur Leute aus dem Regiebuch sind im Bild')
if (plan.screens.join() !== 'Amir') fail('wer im Raum ist, ist nicht zusätzlich auf dem Bildschirm')
if (plan.refs.length !== 2 || plan.refs[0]?.url !== 'https://example.com/lena.png') fail('nur bekannte Vorlagen, jede einmal')
if (sanitizeRegiePlan({ place: 'x' }, { places: [], people: [], options })) fail('ein leerer Plan gilt nicht')
const paint = regiePaintPromptEn({
  plan,
  continuity: { ...room, people: [{ name: 'Lena', lookEn: 'green coat' }], places: [{ name: 'Lenas Zimmer', lookEn: 'window left' }] },
  styleLabel: 'Filmzeichnung',
  stylePrompt: 'ink',
  languageEn: 'Persian',
  fixEn: 'Lena is a woman',
})
if (!paint.startsWith('DIRECTOR FIX')) fail('die Korrektur der Regie steht zuerst')
if (!paint.includes('camera behind her right shoulder') || !paint.includes('window left')) fail('Plan und Ort gehen an den Maler')
if (!paint.includes('green coat') || !paint.includes('Seen only on a screen')) fail('Aussehen und Bildschirm-Leute gehen an den Maler')
if (/video|laptop|webcam|tea|duck|ente/i.test(paint)) fail('der Plan-Auftrag hat keine Regeln für bestimmte Lagen')
if (!regieAttachmentLegendEn(plan.refs).includes("1. Lena's face and clothes only")) fail('jede Vorlage trägt den Satz der Regie')
if (!regiePlanSummaryDe(plan).includes('Lenas Zimmer')) fail('der Plan wird für spätere Bilder kurz gefasst')

const planSrc = readFileSync('lib/film-regie-plan.ts', 'utf8')
if (!planSrc.includes('regieJson')) fail('die Regie plant mit dem grossen Modell')
if (/video|laptop|webcam|ente|duck/i.test(planSrc)) fail('die Plan-Regie hat keine Regeln für bestimmte Lagen')
const planFn = boardSrc.slice(boardSrc.indexOf('export async function planFilmPanel'), boardSrc.indexOf('export async function judgeFilmPanel'))
if (!planFn.includes('sidePlate') || !planFn.includes('placePlate') || !planFn.includes('stillUrl')) {
  fail('die Regie bekommt Stammbilder, Raum-Vorlagen und frühere Bilder zur Auswahl')
}
const judgeFn = boardSrc.slice(boardSrc.indexOf('export async function judgeFilmPanel'), boardSrc.indexOf('export async function regiebuchFilm'))
if (!judgeFn.includes('regiePlan')) fail('das Urteil kennt den Plan der Regie')
const stillFn = boardSrc.slice(boardSrc.indexOf('export async function stillFilmPanel'), boardSrc.indexOf('export async function saveFilmPlan'))
if (!stillFn.includes('paintRegiePlannedStill')) fail('mit Plan malt Zebla nach dem Plan')
if (!stillFn.includes('askRegieForPlan') || !stillFn.includes('hintDe: correction')) {
  fail('Bild ändern: Regie plant neu mit Hinweis, dann dieselben Vorlagen wie erstes Malen')
}
const apiSrc = readFileSync('api/[...slug].ts', 'utf8')
if (!apiSrc.includes("'film-storyboard-plan'") || !apiSrc.includes('planFilmPanel(')) fail('Planen ist eine eigene Anfrage')
const loopSrc = readFileSync('src/story/generateSceneStills.ts', 'utf8')
if (loopSrc.indexOf('filmPlanPanel') < 0 || loopSrc.indexOf('filmPlanPanel') > loopSrc.indexOf('filmStill(')) {
  fail('zuerst plant die Regie, dann wird gemalt')
}

const opts2 = { places: ['Videochat'], people: ['Lena', 'Amir'], options }
const newPlace = readRegiePlan(
  {
    place: 'Amirs Zimmer',
    placeLookEn: 'bookshelf on the left wall',
    bodies: ['Amir (at his desk)', 'Handlung'],
    screens: 'Lena',
    cameraDe: 'Nah auf Amir.',
    paintEn: 'Amir at his desk.',
    refs: [],
  },
  opts2,
)
if (!newPlace.plan) fail(`ein Ort, der noch nicht im Regiebuch steht, wird angenommen: ${newPlace.errorDe}`)
if (newPlace.plan.place !== 'Amirs Zimmer' || !newPlace.plan.placeLookEn) fail('der neue Ort und sein Aussehen gehen mit')
if (newPlace.plan.bodies.join() !== 'Amir') fail('«Amir (at his desk)» ist Amir, «Handlung» ist keine Person')
if (newPlace.plan.screens.join() !== 'Lena') fail('ein einzelner Name als Text gilt auch')
if (!regiePaintPromptEn({ plan: newPlace.plan, styleLabel: 'x', stylePrompt: 'y', languageEn: 'Persian' }).includes('bookshelf on the left wall')) {
  fail('der Maler bekommt das Aussehen des neuen Ortes')
}
if (!readRegiePlan([{ cameraDe: 'a', paintEn: 'b' }], opts2).plan) fail('eine Liste mit einem Plan wird gelesen')
if (!readRegiePlan({ cameraDe: 'a' }, opts2).errorDe?.includes('Auftrag')) fail('ein fehlender Auftrag hat einen deutschen Grund')
if (!regiePlanErrorLineDe('Zeitlimit.').startsWith('Regie konnte dieses Bild nicht planen: Zeitlimit. Gemalt wurde ohne Plan.')) {
  fail('der Satz unter dem Bild sagt, warum ohne Plan gemalt wurde')
}
if (!planSrc.includes('errorDe') || planSrc.includes('return null')) fail('Planen scheitert nie still: es gibt einen Grund zurück')
if (!planSrc.includes('placeLookEn') || !planSrc.includes('Handlung')) fail('die Regie darf neue Orte nennen und liest Handlung als Anweisung')
if (!planFn.includes('regiePlanError')) fail('der Grund wird beim Bild gespeichert')
if (!boardSrc.includes('function panelPersonName') || !boardSrc.includes('Regieanweisung ohne Sprecher')) {
  fail('«Handlung» ist keine Person für Board-Vorschlag und Urteil')
}
if (!judgeFn.includes('darf hier nicht erscheinen')) fail('das Urteil bekommt ein Bild vom anderen Ort als Warnung')
if (!loopSrc.includes('planErrorDe') || !loopSrc.includes('Regie konnte nicht planen')) {
  fail('die Statuszeile sagt, wenn die Regie nicht planen konnte')
}
if (/catch \{\s*\/\* Ohne Plan/.test(loopSrc)) fail('kein stilles Weitermalen ohne Plan')

const regiebuchPrompt = contSrc.slice(contSrc.indexOf('const SYSTEM'), contSrc.indexOf('export function storyTextForContinuity'))
for (const need of ['nur was man sieht', 'Haare: Farbe, Länge, Frisur', 'Hautfarbe', 'Kleidung mit Farben', 'Brille']) {
  if (!regiebuchPrompt.includes(need)) fail(`Regiebuch: Personen nur nach Aussehen (${need})`)
}
if (!regiebuchPrompt.includes('gehören NICHT')) fail('Regiebuch: Charakter und Hobbys gehören nicht ins Aussehen')
if (!regiebuchPrompt.includes('Wand für Wand') || !regiebuchPrompt.includes('nie dieselbe Beschreibung')) {
  fail('Regiebuch: Orte Wand für Wand und jeder Ort unverwechselbar')
}
if (!contSrc.includes('SCHON GEMALTE BILDER') || !boardSrc.includes('regiebuchStills(board)')) {
  fail('Neu lesen: die Regie sieht gutgeheissene gemalte Bilder')
}
if (!boardSrc.includes('regieCheck?.ok && panel.regieCheck.stillUrl === url')) fail('nur Bilder, die die Regie gutgeheissen hat')

{
  const bare = fallbackContinuity({ text: 'Videochat', people: ['Amir'], places: ['Erste Begegnung'] })
  if (isRegieReading(bare)) fail('der Ersatz ohne KI gilt nicht als gelesenes Regiebuch')
  if (!isRegieReading({ ...bare, people: [{ name: 'Amir', lookEn: 'x', lookDe: 'Mann um 25' }] })) {
    fail('ein Regiebuch mit deutschem Aussehen ist echt')
  }
  if (!isRegieReading({ ...bare, byUser: true })) fail('ein von Jean-Marie geändertes Regiebuch ist echt')
  if (!continuityProblemDe({ people: [] }).includes('Wo und wie')) fail('eine unvollständige Antwort hat einen deutschen Grund')
  const readSrc = contSrc.slice(contSrc.indexOf('async function readStory'), contSrc.indexOf('/** Das Regiebuch passt noch'))
  if (readSrc.includes('return null') || !readSrc.includes('errorDe')) fail('Lesen misslingt nie still')
  if (!readSrc.includes('Array.isArray(raw)')) fail('eine Antwort als Liste wird gelesen')
  if (!readSrc.includes('Promise.all') || !readSrc.includes('imagePart(still.url, 8_000)')) fail('Bilder fürs Regiebuch parallel und mit kurzer Wartezeit')
  if (!readSrc.includes('REPAIR_MIN_MS')) fail('bei unvollständiger Antwort einmal nachfragen, wenn Zeit bleibt')
  if (!contSrc.includes('REGIEBUCH_BUTTON_BUDGET_MS = 150_000')) fail('«Neu lesen» darf bis 150 s brauchen')
  const ensureSrc = contSrc.slice(contSrc.indexOf('export async function ensureFilmContinuityRead'), contSrc.indexOf('export async function ensureFilmContinuity('))
  if (ensureSrc.indexOf('isRegieReading(cached)') < 0 || ensureSrc.indexOf('isRegieReading(cached)') > ensureSrc.indexOf('fallbackContinuity(')) {
    fail('ein echtes Regiebuch wird nie durch den Ersatz überschrieben')
  }
  const bookFn = boardSrc.slice(boardSrc.indexOf('export async function regiebuchFilm'), boardSrc.indexOf('export async function prepareFilmReferences'))
  if (!bookFn.includes('rereadFilmContinuity') || bookFn.indexOf('if (!got.continuity)') > bookFn.indexOf('updateDialog(')) {
    fail('«Neu lesen» speichert bei einem Fehler nichts und gibt den Grund zurück')
  }
  const prepFn = boardSrc.slice(boardSrc.indexOf('export async function prepareFilmReferences'), boardSrc.indexOf('export async function stillFilmPanel'))
  if (!prepFn.includes('continuityIsCurrent') || !prepFn.includes('Das bisherige Regiebuch bleibt')) {
    fail('vor den Bildern: Lesen ist ein eigener Schritt und sagt, wenn es misslang')
  }
  const bookUi = readFileSync('src/story/FilmRegiebuch.tsx', 'utf8')
  if (!bookUi.includes('result.errorDe') || !bookUi.includes('Das bisherige Regiebuch bleibt')) {
    fail('das Regiebuch sagt, wenn die Regie nicht lesen konnte, statt «hat gelesen»')
  }
}

const lenaRoom =
  'Lenas Zimmer mit hellbeigen Wänden und hellem Holzfussboden. Links steht ein Holzschreibtisch mit Schubladen, darauf ein grauer Laptop, ein Stapel Bücher (teilweise mit persischer Schrift) und eine Tischlampe mit beigem Schirm. An der Rückwand hängt eine Korktafel mit Notizen und einem kleinen gerahmten Bild. Eine kleine grüne Zimmerpflanze steht auf einem niedrigen Holzregal rechts. Lena sitzt am Schreibtisch und schaut auf den Laptop.'
const amirRoom =
  'Amirs Zimmer mit hellbeigen Wänden und hellem Holzfussboden. Links steht ein Holzschreibtisch mit Schubladen, darauf ein grauer Laptop, ein Stapel Bücher (teilweise mit persischer Schrift) und eine Tischlampe mit beigem Schirm. An der Rückwand befindet sich ein Fenster mit einem Heizkörper darunter. Eine Korktafel mit Notizen und einem kleinen gerahmten Bild hängt am linken Teil der Rückwand. Rechts steht ein Holzregal. Amir sitzt am Schreibtisch und schaut auf den Laptop.'
const twoRooms = sanitizeContinuity(
  {
    situationDe: 'Erste Begegnung im Videochat',
    situationEn: 'First meeting by video call.',
    together: false,
    people: [
      { name: 'Lena', lookEn: 'young woman, green t-shirt' },
      { name: 'Amir', lookEn: 'young man, orange shirt' },
    ],
    places: [
      { name: 'Lenas Zimmer', lookEn: "Lena's room, beige walls. Lena sits at the desk.", lookDe: lenaRoom },
      { name: 'Lenas Zimmer Karte', lookEn: 'same room, map of Tehran', lookDe: lenaRoom.replace('kleinen gerahmten Bild', 'Karte von Teheran') },
      { name: 'Amirs Zimmer', lookEn: 'Amir sits at his desk. Window on the back wall.', lookDe: amirRoom },
      { name: 'Amirs Zimmer (Karte)', lookEn: 'map', lookDe: amirRoom },
      { name: 'Lenas Bildschirm', lookEn: 'laptop screen with a video call', lookDe: 'Lenas Laptop-Bildschirm.' },
    ],
    locksEn: [],
    shots: [
      { panelId: 'p1', viewKey: 'lenas zimmer|weit', sendViewKeys: [] },
      { panelId: 'p2', viewKey: 'lenas zimmer karte|weit', sendViewKeys: ['lenas zimmer karte|weit', 'lenas zimmer|weit'] },
      { panelId: 'p3', viewKey: 'amirs-zimmer-karte|nah', sendViewKeys: [] },
    ],
  },
  'x',
  [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
)
if (!twoRooms) fail('Regiebuch mit zwei Zimmern wird gelesen')
if (twoRooms.places.map((place) => place.name).join() !== 'Lenas Zimmer,Amirs Zimmer,Lenas Bildschirm') {
  fail(`ein Raum ist ein Ort, «… Karte» fällt weg: ${twoRooms.places.map((place) => place.name).join()}`)
}
for (const place of twoRooms.places) {
  if (/\b(Lena|Amir)\b(?!['’]s)/.test(`${place.lookDe} ${place.lookEn}`)) fail(`Ort «${place.name}» beschreibt den leeren Raum, ohne Leute`)
}
if (!twoRooms.places[0]!.lookDe!.startsWith('Lenas Zimmer mit hellbeigen') || !twoRooms.places[0]!.lookEn.includes("Lena's room")) {
  fail('«Lenas Zimmer» und «Lena\'s room» bleiben stehen, nur Sätze mit Leuten fallen weg')
}
const p2 = twoRooms.shots.find((shot) => shot.panelId === 'p2')!
if (p2.viewKey !== 'lenas zimmer|karte|weit' || p2.sendViewKeys.join() !== 'lenas zimmer|karte|weit,lenas zimmer|weit') {
  fail(`Blicke der «Karte» gehören zu Lenas Zimmer: ${p2.viewKey} / ${p2.sendViewKeys.join()}`)
}
if (twoRooms.shots.find((shot) => shot.panelId === 'p3')!.viewKey !== 'amirs zimmer|karte|nah') fail('auch «amirs-zimmer-karte» gehört zu Amirs Zimmer')
if (placeForName(['Lenas Zimmer', 'Amirs Zimmer'], 'Lenas Zimmer Karte') !== 'Lenas Zimmer') fail('«Lenas Zimmer Karte» ist Lenas Zimmer')
if (placeForName(['Lenas Zimmer', 'Amirs Zimmer'], 'Küche')) fail('ein fremder Name ist kein bekannter Ort')
const planKarte = readRegiePlan(
  { place: 'Lenas Zimmer Karte', placeLookEn: 'map', cameraDe: 'Nah auf die Karte.', paintEn: 'map on the wall' },
  { places: ['Lenas Zimmer', 'Amirs Zimmer'], people: ['Lena', 'Amir'], options: [] },
)
if (planKarte.plan?.place !== 'Lenas Zimmer' || planKarte.plan.placeLookEn) fail('der Plan nimmt den Raum aus dem Regiebuch, keinen neuen Ort')
if (placesTooAlike([{ name: 'Lenas Zimmer', lookEn: '', lookDe: lenaRoom }, { name: 'Amirs Zimmer', lookEn: '', lookDe: amirRoom }]).length !== 1) {
  fail('zwei fast gleiche Zimmer werden erkannt')
}
if (placesTooAlike([
  { name: 'Lenas Zimmer', lookEn: '', lookDe: lenaRoom },
  { name: 'Amirs Zimmer', lookEn: '', lookDe: 'Amirs Zimmer mit dunkelgrünen Wänden und grauem Teppich. Rechts ein schwarzer Metalltisch vor dem Fenster, darauf ein silberner Laptop. Hinten ein volles Bücherregal bis zur Decke, daneben eine Gitarre an der Wand und ein Poster von Isfahan. Links ein ungemachtes Bett mit blauer Decke.' },
]).length) {
  fail('verschiedene Zimmer gelten nicht als gleich')
}
if (!contSrc.includes('LEERE Raum') || !contSrc.includes('genau EIN Ort') || !contSrc.includes('placesTooAlike')) {
  fail('die Regie beschreibt leere Räume, einen Ort pro Raum, und fragt nach, wenn zwei Orte gleich sind')
}
if (!contSrc.includes('Maler einen Raum in den anderen kopiert')) fail('die Regie weiss, dass Vorlagen falsch sein können')
if (!judgeFn.includes('placeForName')) fail('das Urteil zählt «Lenas Zimmer Karte» als Lenas Zimmer')

const storedBook = {
  ...twoRooms,
  places: [
    { name: 'Lenas Zimmer', lookEn: 'beige room. Lena sits at the desk.', lookDe: lenaRoom },
    { name: 'Lenas Zimmer Karte', lookEn: 'same room with map', lookDe: lenaRoom },
    { name: 'Amirs Zimmer', lookEn: 'beige room. Amir sits at the desk.', lookDe: amirRoom },
    { name: 'Amirs Zimmer Karte', lookEn: 'map', lookDe: amirRoom },
    { name: 'Lenas Bildschirm', lookEn: 'laptop screen', lookDe: 'Lenas Laptop-Bildschirm.' },
  ],
  shots: [
    { panelId: 'p1', viewKey: 'lenas zimmer|weit', sendViewKeys: [], whyDe: 'a' },
    { panelId: 'p2', viewKey: 'lenas zimmer karte|weit', sendViewKeys: ['lenas zimmer|weit'], whyDe: 'b' },
  ],
}
const tidied = tidyContinuity(storedBook)
if (tidied.places.map((place) => place.name).join() !== 'Lenas Zimmer,Amirs Zimmer,Lenas Bildschirm') fail('ein gespeichertes Regiebuch wird ohne Neu-Lesen aufgeräumt')
if (/Lena sitzt|Amir sitzt|Lena sits|Amir sits/.test(JSON.stringify(tidied.places))) fail('gespeicherte Orte verlieren die Sätze mit Leuten')
if (tidied.shots[1]!.viewKey !== 'lenas zimmer|karte|weit') fail('gespeicherte Blicke gehören zum einen Raum')
if (JSON.stringify(tidyContinuity(tidied)) !== JSON.stringify(tidied)) fail('Aufräumen zweimal ändert nichts mehr')
const mine = tidyContinuity({ ...storedBook, byUser: true })
if (mine.places.length !== 3 || !mine.places[0]!.lookDe!.includes('Lena sitzt')) fail('von Jean-Marie: doppelte Orte fallen zusammen, seine Texte bleiben')
if (placesTooAlike(tidied.places).length !== 1) fail('die zwei gleichen Zimmer im gespeicherten Regiebuch werden erkannt')
const normalized = normalizeFilmStoryboard({ panels: [], continuity: storedBook } as unknown as FilmStoryboard)
if (normalized.continuity?.places.length !== 3) fail('Planen, Anschauen und Malen bekommen das aufgeräumte Regiebuch')
const bookUi = readFileSync('src/story/FilmRegiebuch.tsx', 'utf8')
if (!bookUi.includes('tidyContinuity(board.continuity)')) fail('die Seite zeigt das aufgeräumte Regiebuch')
if (!bookUi.includes('placesTooAlike') || !bookUi.includes('sehen fast gleich aus')) fail('fast gleiche Zimmer: Hinweis auf «Neu lesen»')
if (!bookUi.includes('failed to fetch')) fail('abgebrochene Verbindung steht auf Deutsch da')
if (!bookUi.includes('Raumbild')) fail('Regiebuch: Raumbild zeichnen und ändern')
if (!readFileSync('shared/film-room-plate.ts', 'utf8').includes('placesMissingRoomPlate')) {
  fail('fehlende Raumbilder werden erkannt')
}
if (!boardSrc.includes('reviewFilmScene')) fail('Gesamtschau: ein Schritt je Anfrage')
if (!readFileSync('src/story/FilmSceneGenerate.tsx', 'utf8').includes('Szene prüfen')) {
  fail('Szene prüfen: Knopf nach fertiger Szene')
}
if (!readFileSync('api/[...slug].ts', 'utf8').includes('film-scene-review')) fail('Gesamtschau: eigene Anfrage')
const reviewSrc = readFileSync('lib/film-scene-review.ts', 'utf8')
if (!reviewSrc.includes('Kleidung') || !reviewSrc.includes('Schreibtisch')) {
  fail('Gesamtschau vergleicht Kleidung und Schreibtisch über die Szene')
}
if (!readFileSync('lib/film-regie-plan.ts', 'utf8').includes('hintDe')) {
  fail('Planen bei Bild ändern: hintDe')
}

console.log('OK film-continuity')
