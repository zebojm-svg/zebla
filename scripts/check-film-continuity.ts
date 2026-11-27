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

console.log('OK film-continuity')
