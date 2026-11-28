/**
 * Regie liest die Geschichte einmal. Der Satz geht mit jedem Bild.
 * Aufruf: npx tsx scripts/check-film-continuity.ts
 */
import { readFileSync } from 'node:fs'
import { buildFilmStillPrompt } from '../shared/film-stills.ts'
import { DEFAULT_STORY_ART_STYLE, paintingStyleId } from '../shared/story-art-styles.ts'
import { pickedCastUrl } from '../shared/catalog-cast.ts'
import { paintingStyleText } from '../lib/ken-burns-style.ts'
import {
  continuityBriefEn,
  continuitySourceKey,
  directorStillUrls,
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
if (!contSrc.includes('VORGABEN VON JEAN-MARIE')) fail('Regie liest Jean-Maries Änderungen als Vorgabe')
const boardSrc = readFileSync('lib/film-storyboard.ts', 'utf8')
if (!boardSrc.includes('carry?.byUser')) fail('«Bilder planen» löscht das geänderte Regiebuch nicht')

if (!contSrc.includes('aus jeder Richtung zeichnen')) fail('Orte im Regiebuch sagen, was an welcher Wand ist')
if (!contSrc.includes('gegenüberliegende Wand')) fail('Gegenschuss zeigt die andere Wand (Regie-Satz, kein Code)')
if (!contSrc.includes('posieren nicht')) fail('die Regie prüft, dass niemand für den Zuschauer posiert')

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
if (!stillFn.includes('!correction && panel.regiePlan') || !stillFn.includes('paintRegiePlannedStill')) {
  fail('mit Plan malt Zebla nach dem Plan, Korrekturen gehen den alten Weg')
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

console.log('OK film-continuity')
