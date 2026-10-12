/**
 * Szenen-Geräusche aus der Ton-Notiz.
 * Aufruf: npx tsx scripts/check-film-scene-foley.ts
 */
import { readFileSync } from 'node:fs'
import {
  foleyDurationMs,
  foleyEventsFromText,
  foleyFlagsFromNote,
  inferSoundCueDe,
  SCENE_FOLEY_GAIN,
  SCENE_PAD_GAIN,
  SCENE_VOICE_GAIN,
} from '../shared/film-scene-foley.ts'

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

const nuts = foleyFlagsFromNote(
  'Leises Knistern von Nüssen, gedämpfte Stadtgeräusche, sanfte persische Instrumentalmusik.',
)
if (!nuts.crackle) fail('Nuss-Knistern aus der Notiz')
if (nuts.city) fail('Mit persischer Musik kein Stadtbrummen, auch wenn die KI Stadtgeräusche mitgeschrieben hat')

const street = foleyFlagsFromNote('Stadtrauschen, kein Dialog')
if (!street.city) fail('Nur Stadtrauschen → Stadtgeräusch')

const music = foleyFlagsFromNote('leise persische Musik, ab und zu eine Nuss knacken')
if (music.city) fail('Persische Musik ist kein Stadtlärm')
if (!music.crackle) fail('Nuss in der Musik-Notiz')

const quiet = foleyFlagsFromNote('nur Stimmen')
if (quiet.crackle || quiet.city) fail('Ohne Hinweis keine Extra-Geräusche')

if (SCENE_PAD_GAIN < 0.06) fail('Musik muss hörbar sein, nicht nur ein Brummen')
if (SCENE_VOICE_GAIN <= SCENE_PAD_GAIN * 6) {
  fail('Dialogstimme muss über der Hintergrundmusik liegen')
}
if (SCENE_VOICE_GAIN <= SCENE_FOLEY_GAIN) fail('Dialog über dem Nuss-Knacken')

if (!foleyEventsFromText('Ramo füllt Wasser in einen Teekessel').includes('fill')) {
  fail('Auffüllen des Kessels')
}
if (!foleyEventsFromText('Der Teekessel beginnt leise zu pfeifen, Dampf steigt auf').includes('whistle')) {
  fail('Pfeifen des Kessels')
}
if (!foleyEventsFromText('Ramo gießt den Tee in eine Kanne').includes('pour')) {
  fail('Plätschern beim Eingießen')
}
if (!foleyEventsFromText('Da klopft es an der Tür').includes('knock')) {
  fail('Klopfen an der Tür')
}
if (!foleyEventsFromText('Ramo bereitet Tee vor für seine Gäste').includes('fill')) {
  fail('Tee vorbereiten klingt nach Wasser in den Kessel')
}
if (!inferSoundCueDe('Ramo gießt den Tee in eine Kanne').toLowerCase().includes('plätscher')) {
  fail('Ton-Regie fürs Eingießen')
}
if (inferSoundCueDe('egal', 'Kessel pfeift') !== 'Kessel pfeift') {
  fail('geschriebene Ton-Regie bleibt stehen')
}
if (foleyDurationMs(['whistle']) < 2000) fail('Pfeifen braucht Zeit im Bild')
if (foleyDurationMs(['fill', 'pour']) < 2100) fail('Wasser braucht Zeit')

const previewSrc = readFileSync(new URL('../src/story/FilmScenePreview.tsx', import.meta.url), 'utf8')
if (!previewSrc.includes('playVoice')) fail('Szene abspielen muss die Stimme über Web Audio spielen')
if (!previewSrc.includes('playBlob')) fail('Szene abspielen muss die Stimme als lokale Datei abspielen')
if (!previewSrc.includes('decodeVoice')) fail('Szene abspielen muss die KI-Stimme decodieren')
if (!previewSrc.includes('lineAudio')) {
  fail('Szene abspielen holt die Stimme same-origin, nicht als fremdes HTML-Audio')
}

const bedSrc = readFileSync(new URL('../src/story/sceneBedMusic.ts', import.meta.url), 'utf8')
if (!bedSrc.includes('foleyBus')) fail('Knistern braucht einen eigenen Bus, nicht das leise Pad')
if (!bedSrc.includes('SCENE_FOLEY_GAIN')) fail('Foley-Lautstärke aus der gemeinsamen Konstante')
if (!bedSrc.includes('SCENE_VOICE_GAIN')) fail('Dialog-Lautstärke aus der gemeinsamen Konstante')
if (!bedSrc.includes('PHRASE')) fail('Persische Figur bleibt der Fallback, nicht nur eine Drohne')
if (!bedSrc.includes('loadBed')) fail('KI-Musik-Schleife laden')
if (!bedSrc.includes('loop')) fail('KI-Musik muss loopen, nicht einmalig piepsen')
if (bedSrc.includes('130.81')) fail('Alte C-Dur-Drohne darf nicht die Musik sein')
if (!previewSrc.includes('filmSceneMusic')) fail('Szene abspielen holt die KI-Musik')
if (!previewSrc.includes('loadBed')) fail('Szene abspielen legt die KI-Musik auf den Bus')
if (!previewSrc.includes('playFoley')) fail('Zwischenbilder spielen Geräusche, nicht nur Pause')
if (previewSrc.includes('Zwischenbilder still')) fail('Zwischenbilder sind nicht mehr still')
if (!previewSrc.includes('Erzähler spricht')) fail('Spieler sagt: Erzähler spricht')
if (!bedSrc.includes('playFoley')) fail('Musik-Bus spielt Foley auf Zuruf')
if (!bedSrc.includes("'whistle'")) fail('Kessel-Pfeifen im Audio')
if (!bedSrc.includes("'pour'")) fail('Plätschern im Audio')
if (!bedSrc.includes("'fill'")) fail('Auffüllen im Audio')
if (!bedSrc.includes("'knock'")) fail('Klopfen im Audio')

const lyriaSrc = readFileSync(new URL('../lib/scene-bed.ts', import.meta.url), 'utf8')
if (!lyriaSrc.includes('lyria-3-clip-preview')) fail('Szenenmusik kommt von Lyria, nicht vom Oszillator')
if (!lyriaSrc.includes('No vocals')) fail('Szenenmusik ohne Gesang')
if (!lyriaSrc.includes('Not 8-bit')) fail('Szenenmusik darf nicht nach Game Boy klingen')

console.log('OK: Szenen-Geräusche aus der Ton-Notiz')
